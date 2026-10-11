import type { DocAnchor } from '@/lib/process-documentation';
import { capabilityPresence, type Capability, type CapabilityFacts, type FactObject } from '@/lib/documentation-capabilities';

/**
 * The business page every documentation opens with (owner 11.10.2026, external
 * review of the FI Collection Worklist package, F-07 and §6.1: "I do not want
 * to read 74 technical steps, 66 decision points and hundreds of local
 * assignments first. They may be there, but behind the business answers.").
 *
 * One page, from the engine's facts only — no model is asked:
 *
 *   - **what it does** in four to six sentences;
 *   - **what it does not do**: each capability the whole source shows to be
 *     absent (no posting, no correspondence, no approval, no ledger
 *     reconciliation …), so a later text cannot claim it as practice;
 *   - **the limits of this reading**;
 *   - **owner and approval**: *Not determined* / *Not recorded* unless recorded;
 *   - **entry questions** that lead to the part of the document answering them
 *     ("Why is an item missing?" → the data it reads and which rows).
 *
 * The stage, the Word, Markdown and Confluence exports of the process
 * description and the delivery package's `process-documentation.md` all render
 * this one model; each maps the entry questions' sections to its own anchors.
 *
 * Pure and engine-free.
 */

export type BusinessPageBasis = 'reconstructed' | 'not-determined' | 'confirmed';

export interface BusinessPageLine {
  text: string;
  anchors: DocAnchor[];
  basis: BusinessPageBasis;
}

/** The part of a document an entry question leads to. Each rendering maps it to its own anchor. */
export type BusinessPageTarget = 'data' | 'rules' | 'exceptions' | 'changes' | 'questions';

export interface EntryQuestion {
  question: string;
  /** Where the answer stands, in one line. */
  answer: string;
  target: BusinessPageTarget;
}

export interface BusinessPage {
  does: BusinessPageLine[];
  doesNot: BusinessPageLine[];
  limits: BusinessPageLine[];
  owner: BusinessPageLine;
  approval: BusinessPageLine;
  questions: EntryQuestion[];
}

export interface BusinessPageInput {
  program: string;
  /** Sentences that already say what it does in business words (the description's summary). At most two are used. */
  summary?: ReadonlyArray<{ text: string; anchors: readonly DocAnchor[] }>;
  facts: CapabilityFacts | null;
  counts: {
    steps: number;
    decisions: number;
    rules: number;
    exceptions: number;
    /** Selection-screen inputs. */
    inputs?: number;
  };
  /** The business word of a table where the glossary has one (`BSID` → "customer open items"). */
  tableWord?: (name: string) => string | null;
  /** Recorded by the owner, when something is — the RACI the owner saved, with its date. */
  recorded?: { raci?: string | null } | null;
}

/** The section headings of the page — one set for every rendering. */
export const BUSINESS_PAGE = {
  title: 'In short',
  does: 'What it does',
  doesNot: 'What it does not do',
  limits: 'Limits of this reading',
  owner: 'Owner and approval',
  questions: 'Questions a reader asks',
} as const;

const anchor = (o: FactObject): DocAnchor => ({ lineStart: o.line, lineEnd: o.line });
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** At most three names in words, then "and n more". */
function namesPhrase(list: readonly FactObject[], word: (name: string) => string | null, max = 3): string {
  const shown = list.slice(0, max).map((o) => {
    const w = word(o.name);
    return w ? `${w} (${o.name})` : o.name;
  });
  if (list.length > max) shown.push(`${list.length - max} more`);
  return joinAnd(shown);
}

/** Tables whose content is master or credit data — read as it is stored when the program runs. */
const MASTER_DATA = /^(?:KNA1|KNB1|KNB5|KNKK|KNVV|KNVP|LFA1|LFB1|LFM1|MARA|MARC|MARD|MBEW|MAKT|T001|ADRC|BUT000|UKMBP_CMS_SGM|CSKS|SKA1|SKB1)$/;
/** Tables of financial accounting: where a reader asks about ledgers and credit. */
const FI_TABLES = /^(?:BKPF|BSEG|BSID|BSAD|BSIK|BSAK|BSIS|BSAS|ACDOCA|KNKK|KNB1|KNB5|LFB1|FAGL\w*|GLT0|T001|T014)$/;

const LIST_CALLS = /^(?:REUSE_ALV_|CL_SALV_|CL_GUI_ALV_GRID|LVC_)/;
const FILE_DOWNLOAD = /^(?:GUI_DOWNLOAD|WS_DOWNLOAD|CL_GUI_FRONTEND_SERVICES)$/;
const FILE_UPLOAD = /^(?:GUI_UPLOAD|WS_UPLOAD|ALSM_EXCEL_TO_INTERNAL_TABLE|TEXT_CONVERT_XLS_TO_SAP)$/;

export function buildBusinessPage(input: BusinessPageInput): BusinessPage {
  const { facts, counts } = input;
  const word = input.tableWord ?? (() => null);
  const does: BusinessPageLine[] = [];
  const add = (text: string, anchors: DocAnchor[] = [], basis: BusinessPageBasis = 'reconstructed') => {
    if (does.length < 6 && text.trim()) does.push({ text, anchors, basis });
  };

  const summary = (input.summary ?? []).slice(0, 2);
  for (const s of summary) add(s.text, [...s.anchors]);
  // What the summary already says is not said twice.
  const said = summary.map((s) => s.text.toLowerCase()).join(' ');

  if (facts) {
    if (facts.reads.length && !/\breads?\b/.test(said)) {
      add(`It reads ${plural(facts.reads.length, 'table')} in SAP: ${namesPhrase(facts.reads, word)}.`, facts.reads.slice(0, 3).map(anchor));
    }
    if (counts.rules || counts.decisions) {
      add(`It decides with ${plural(counts.rules, 'business rule')} at ${plural(counts.decisions, 'decision point')} what each record gets.`);
    }
    const list = facts.calls.filter((c) => LIST_CALLS.test(c.name));
    const download = facts.calls.filter((c) => FILE_DOWNLOAD.test(c.name));
    const upload = facts.calls.filter((c) => FILE_UPLOAD.test(c.name));
    const shows = [
      list.length ? 'shows the result as a list on screen' : '',
      download.length ? 'can save it as a file on the user\'s PC' : '',
      upload.length ? 'reads a file from the user\'s PC' : '',
    ].filter(Boolean);
    if (shows.length && !/\b(?:list|file)\b/.test(said)) add(`It ${joinAnd(shows)}.`, [...list, ...download, ...upload].slice(0, 3).map(anchor));
    if (facts.writes.length) {
      add(`It changes ${plural(facts.writes.length, 'table')}: ${namesPhrase(facts.writes, word)}.`, facts.writes.slice(0, 3).map(anchor));
    }
    if (counts.exceptions) add(`It stops or skips with a message in ${plural(counts.exceptions, 'case')}.`);
    if (facts.authority.length) {
      add(`It checks ${plural(facts.authority.length, 'authorization')} before it shows data (${facts.authority.slice(0, 4).map((a) => a.name).join(', ')}${facts.authority.length > 4 ? ' …' : ''}).`, facts.authority.slice(0, 3).map(anchor));
    }
  } else {
    add(`It runs ${plural(counts.steps, 'step')} with ${plural(counts.decisions, 'decision point')}.`);
  }
  if (does.length < 4 && counts.inputs) add(`A run starts from a selection screen with ${plural(counts.inputs, 'input')}.`);

  const doesNot: BusinessPageLine[] = [];
  const limits: BusinessPageLine[] = [];
  if (facts) {
    const presence = capabilityPresence(facts);
    const fi = facts.reads.some((r) => FI_TABLES.test(r.name));
    const credit = facts.reads.some((r) => /^(?:KNKK|UKM\w*|S066|S067)$/.test(r.name));
    const order: Array<[Capability, boolean]> = [
      ['posting', true],
      ['mail', true],
      ['approval', true],
      ['ledger', fi],
      ['credit-exposure', credit],
      ['remote', true],
    ];
    for (const [cap, relevant] of order) {
      if (!relevant || presence[cap].present) continue;
      doesNot.push({ text: presence[cap].absent, anchors: [], basis: 'reconstructed' });
    }
    const master = facts.reads.filter((r) => MASTER_DATA.test(r.name));
    if (master.length) {
      limits.push({
        text: `Master and credit data (${master.slice(0, 4).map((m) => m.name).join(', ')}${master.length > 4 ? ' …' : ''}) are read as they are stored when it runs, not as they were on an earlier date.`,
        anchors: master.slice(0, 3).map(anchor),
        basis: 'reconstructed',
      });
    }
    if (facts.dynamic > 0) {
      limits.push({
        text: `${plural(facts.dynamic, 'place names', 'places name')} its target only at run time; what ${facts.dynamic === 1 ? 'it reaches' : 'they reach'} is not determined.`,
        anchors: [],
        basis: 'not-determined',
      });
    }
  } else {
    doesNot.push({
      text: 'Not determined — this documentation was read before the program\'s capabilities were recorded with it. Read it again from the code.',
      anchors: [],
      basis: 'not-determined',
    });
  }
  limits.push({
    text: 'A line reference shows where a statement comes from in the code. It does not show that the business has confirmed it.',
    anchors: [],
    basis: 'reconstructed',
  });

  const raci = input.recorded?.raci ?? null;
  return {
    does,
    doesNot,
    limits,
    owner: { text: 'Process owner: Not determined — the code names no owner, and none is recorded here.', anchors: [], basis: 'not-determined' },
    approval: raci
      ? { text: `Business approval: Not recorded. The RACI is the owner's (${raci}); the rest is reconstructed from the code.`, anchors: [], basis: 'confirmed' }
      : { text: 'Business approval: Not recorded — reconstructed from the code, not confirmed by the business.', anchors: [], basis: 'not-determined' },
    questions: [
      { question: 'Why is an item missing?', answer: 'Which rows each read takes, and the checks that skip a record.', target: 'data' },
      { question: 'Why is a value unknown?', answer: 'The rules that set each value, and what happens when none applies.', target: 'rules' },
      { question: 'Why is there no proposal or result?', answer: 'The cases that stop the run or skip a record, with the message the user sees.', target: 'exceptions' },
      { question: 'What changes in S/4HANA?', answer: 'What the program changes today; the move itself is decided in Design and Management, with the open questions.', target: 'changes' },
    ],
  };
}

/** One line with its basis as a file prints it: "… (Reconstructed, L42)". */
export function businessPageLineText(line: BusinessPageLine): string {
  const basis = line.basis === 'reconstructed' ? 'Reconstructed' : line.basis === 'confirmed' ? 'Confirmed' : 'Not determined';
  const lines = line.anchors.map((a) => (a.lineEnd > a.lineStart ? `L${a.lineStart}–${a.lineEnd}` : `L${a.lineStart}`));
  const already = line.basis === 'not-determined' && /^(?:[^.]*: )?Not determined\b/.test(line.text);
  if (already && !lines.length) return line.text;
  return `${line.text} (${[already ? '' : basis, ...lines].filter(Boolean).join(', ')})`;
}
