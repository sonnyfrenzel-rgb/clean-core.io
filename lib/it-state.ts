import type { CloudReadinessGrade } from './abap/abcd-classification';
import type { ItFindingsSource, ItUseRow } from './it-findings';
import { itAnswerHead, worstLevel } from './it-view';

/**
 * Which of the IT view's honest states a project is in, and the answer it
 * opens with — after the owner's review of the 3.0 IT view: *"so empty
 * and nested … it must be clear why there is still such emptiness."*
 *
 * Before this the view drew the same frame in every state — four tiles, a
 * chain card, a findings card, an objects card — and let each of them say
 * "nothing" in its own dashed box. A project whose program calls three BAPIs
 * then read "No findings · 0 places · 0 not determined" five times. One state,
 * one headline, one reason, and the sections that have content:
 *
 *   - **no-source** — nothing is staged. Nothing was read, so nothing is said
 *     about the code at all; the one action is the next step.
 *   - **unread** — a source is staged and the findings route did not answer.
 *     Not the same statement as "none".
 *   - **unsigned** — the engine has read the staged source, no run has signed
 *     it. What it read is shown, and said to be unsigned.
 *   - **clean** — a signed run, and no detector raised a finding. The headline
 *     names what the code *uses* instead, so "no findings" never stands beside
 *     a program that plainly calls SAP.
 *   - **findings** — a signed run with findings.
 *
 * Pure: no React, no `fetch`, nothing stored. The level is SAP's published
 * classification, a view — never on a run, an artefact or an audit pack.
 */

export type ItState = 'no-source' | 'unread' | 'unsigned' | 'clean' | 'findings';

export interface ItStateInput {
  /** The findings route's answer: `undefined` while asking, `null` when it did not answer. */
  source: ItFindingsSource | null | undefined;
  /** The project has an ABAP source staged. */
  hasSource: boolean;
  /** A signed run is on record and readable. The demo, which carries none by design, passes `'demo'`. */
  signed: boolean | 'demo';
}

/** `undefined` while the answer is still being read — never a state guessed early. */
export function itState({ source, hasSource, signed }: ItStateInput): ItState | undefined {
  if (!hasSource) return 'no-source';
  if (source === undefined) return undefined;
  if (source === null) return 'unread';
  if (signed === false) return 'unsigned';
  return source.rows.length === 0 ? 'clean' : 'findings';
}

/* ---------------------------------------------------------- what the code uses */

const KIND_WORDS: Record<ItUseRow['kind'], [string, string]> = {
  bapi: ['BAPI', 'BAPIs'],
  'function-module': ['function module', 'function modules'],
  table: ['table', 'tables'],
  transaction: ['transaction', 'transactions'],
  program: ['report', 'reports'],
  object: ['object', 'objects'],
};

export function kindWord(kind: ItUseRow['kind'], n = 1): string {
  return KIND_WORDS[kind][n === 1 ? 0 : 1];
}

/** "level B", or the plain words for a level the catalog could not give. */
function levelWords(level: CloudReadinessGrade | null): string {
  if (level === null) return 'level not determined';
  if (level === 'Unknown') return 'level Unknown';
  return `level ${level}`;
}

/** `A, B and C` — the list a sentence can carry. */
function listWords(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export interface UsesSummary {
  /** Distinct objects the code uses. */
  objects: number;
  calls: number;
  reads: number;
  writes: number;
  /** Use rows per level, worst first; only the levels present. */
  levels: Array<{ grade: CloudReadinessGrade; count: number }>;
  /** One sentence on how the program reaches other code and data. */
  sentence: string;
}

const LEVEL_ORDER: readonly CloudReadinessGrade[] = ['D', 'C', 'B', 'A', 'Unknown'];

/**
 * The uses in one sentence — the one the owner asked for: *"this program
 * writes no database table directly; it changes data only through
 * BAPI_SALESORDER_CREATEFROMDAT2, which is level B."* It says only what the
 * statements show: a call is a call, not a claim about what the callee does.
 */
export function usesSummary(uses: readonly ItUseRow[] | undefined): UsesSummary | null {
  if (!uses) return null;
  const distinct = (use: ItUseRow['use']) => new Set(uses.filter((u) => u.use === use).map((u) => u.object)).size;
  const calls = distinct('call');
  const reads = distinct('read');
  const writes = distinct('write');
  const objects = new Set(uses.map((u) => u.object)).size;
  const levels = LEVEL_ORDER.map((grade) => ({ grade, count: uses.filter((u) => u.level === grade).length })).filter(
    (l) => l.count > 0,
  );

  const callRows = uses.filter((u) => u.use === 'call');
  const named = callRows.slice(0, 3).map((u) => `${u.object} (${levelWords(u.level)})`);
  const more = callRows.length - named.length;
  const callList = more > 0 ? `${named.join(', ')} and ${more} more` : listWords(named);

  let sentence: string;
  if (objects === 0) {
    sentence =
      'It calls no function module, transaction or report the engine can name, and reads or writes no database table.';
  } else if (reads === 0 && writes === 0) {
    sentence = `It reads and writes no database table directly; it works only through ${
      callRows.length === 1 ? 'one call' : `${callRows.length} calls`
    }: ${callList}.`;
  } else {
    const parts = [
      calls > 0 ? `calls ${calls} ${calls === 1 ? 'object' : 'objects'}` : null,
      reads > 0 ? `reads ${reads} ${reads === 1 ? 'table' : 'tables'}` : null,
      writes > 0 ? `writes ${writes} ${writes === 1 ? 'table' : 'tables'} directly` : 'writes no table directly',
    ].filter((p): p is string => p !== null);
    sentence = `It ${listWords(parts)}.`;
  }
  return { objects, calls, reads, writes, levels, sentence };
}

/* ---------------------------------------------------------------- the answer */

export interface ItOpening {
  state: ItState;
  /** The `h2` — one sentence that answers the view's question for this state. */
  title: string;
  /** Why the view looks the way it does, in one or two sentences. */
  reason: string;
}

/**
 * The headline and the reason for a state. `notDetermined` is the one count of
 * *Not determined* the whole page shows (`lib/workspace-model.ts`
 * `notDetermined`) — the reason names it so the reader is not left wondering
 * why a clean answer still has open points.
 */
export function itOpening(
  state: ItState,
  source: ItFindingsSource | null,
  notDetermined: number,
): ItOpening {
  const uses = usesSummary(source?.uses);
  const open =
    notDetermined > 0
      ? ` ${notDetermined} ${notDetermined === 1 ? 'construct is' : 'constructs are'} outside what the detectors judge — listed under Not determined, each with its line.`
      : '';
  const lines = source?.coverage?.lines;
  const read = typeof lines === 'number' ? `in the ${lines} ${lines === 1 ? 'line' : 'lines'} the engine read` : 'in the staged source';

  switch (state) {
    case 'no-source':
      return {
        state,
        title: 'No ABAP source yet, so there is nothing for IT to read',
        reason:
          'This view lists what a program calls, reads and writes with the clean core level of each object, the findings, and what the engine could not judge. All of it is read from the source, so it fills in as soon as Analyze has one.',
      };
    case 'unread':
      return {
        state,
        title: itAnswerHead(null).title,
        reason: `${itAnswerHead(null).coverage} Reload the page; the source on the project is unchanged.`,
      };
    case 'unsigned': {
      // The same answer the signed states give, said to be unsigned first: the
      // engine's reading is shown, never withheld, and never passed off as signed.
      const rows = source?.rows ?? [];
      const content = itOpening(rows.length === 0 ? 'clean' : 'findings', source, notDetermined);
      return {
        state,
        title: content.title,
        reason: `No signed run yet — this is the engine’s reading of the staged source, and nothing here is signed until the analysis runs. ${content.reason}`,
      };
    }
    case 'clean': {
      const title =
        uses && uses.objects > 0
          ? uses.reads === 0 && uses.writes === 0
            ? `No clean core finding — the program works through ${uses.calls} ${uses.calls === 1 ? 'call' : 'calls'} and touches no table directly`
            : `No clean core finding in the ${uses.objects} ${uses.objects === 1 ? 'object' : 'objects'} the code uses`
          : 'No clean core finding, and no SAP object the engine can name';
      return {
        state,
        title,
        reason: `${uses ? `${uses.sentence} ` : ''}The detectors raised no finding ${read}.${open}`,
      };
    }
    case 'findings': {
      const head = itAnswerHead(source);
      const worst = worstLevel(source?.rows ?? []);
      return {
        state,
        title: head.title,
        reason:
          `${uses ? `${uses.sentence} ` : ''}` +
          (worst ? `The findings below start with level ${worst.grade}; each has its line and both SAP catalog views.` : '') +
          open,
      };
    }
  }
}
