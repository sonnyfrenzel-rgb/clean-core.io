import { readStatements, type AbapStatement, type SourceRange } from './abap/statement-reader';

/**
 * Does a model's business statement say something its own anchors do not
 * carry? — roadmap 17.10.
 *
 * Weg B (`lib/business-statement-prompt.ts`) writes the readable sentence and
 * Weg A (`lib/abap/business-statement.ts`) the one the code proves. Sonny's
 * decision of 27.09.2026 puts both at the element: B on top as *Model
 * proposal*, A beneath it as the evidence. Where the two disagree, the reader
 * has to be told — and this module is what tells them. It reads the ABAP
 * statements at the sentence's anchors and nothing else: no model, no
 * network, no second opinion.
 *
 * **Conservative on purpose.** A mark that is wrong teaches the reader to
 * ignore marks, so every rule below fires only on a pattern the code settles
 * without interpretation, and each stays silent when anything at the anchors
 * could make the sentence true after all (another output statement, a call, a
 * write). Nothing is marked rather than something wrongly. The rules come from
 * the judges' findings over the learning half of the process benchmark
 * (`tests/prozess-benchmark/split.json`), not from single cases; the holdout
 * half was measured once, at the end (`docs/ROADMAP.md`, result 17.10).
 *
 * Two verdicts, never more:
 *
 *   - `contradicts` — the code at the anchors does the opposite of what the
 *     sentence says: a message the sentence calls *displayed* is written
 *     `MESSAGE … INTO`, which displays nothing.
 *   - `unsupported` — the code at the anchors does not carry the claim, and
 *     whether it holds depends on something outside them: a `MESSAGE …
 *     RAISING` is shown only when the caller does not handle the exception.
 *
 * The anchor range is the anchored statements plus, for a statement that opens
 * a branch or a block (`IF`, `ELSE`, `WHEN`, `LOOP`, `AT NEW` …), the
 * statements of that branch — prompt rule 3 anchors a branch's sentence to its
 * condition line, and what follows from a condition is in its branch.
 *
 * Pure: no React, no DOM, no network, no clock.
 */

export type ContradictionVerdict = 'contradicts' | 'unsupported';

export type ContradictionRule =
  /** "displayed" at `MESSAGE … INTO`, which only fills the message variables. */
  | 'message-into'
  /** "displayed" at `WRITE … TO`, which formats into a variable. */
  | 'write-to'
  /** "displayed" at `MESSAGE … RAISING`, which the caller may handle silently. */
  | 'message-raising'
  /** "the program ends" at a `RETURN`/`EXIT`/`STOP` that leaves one block only. */
  | 'program-end'
  /** "stored/posted" where the anchors only read, decide or output. */
  | 'persistence'
  /** An exception or event the source does not name at all. */
  | 'not-raised'
  /** "created" at a transaction that, in the SAP standard, displays — a fixed list. */
  | 'display-transaction';

export interface StatementContradiction {
  verdict: ContradictionVerdict;
  rule: ContradictionRule;
  /** One sentence for the reader, in the interface language. */
  reason: string;
  /** The ABAP statements that show it. */
  lines: SourceRange[];
}

/** The code, read once — the check runs per sentence against it. */
export interface ContradictionSource {
  statements: AbapStatement[];
  /** The source with comments removed, upper-cased — for "does this name occur at all". */
  upper: string;
}

export function contradictionSourceOf(source: string): ContradictionSource {
  const statements = readStatements(source.replace(/\r\n/g, '\n'));
  return { statements, upper: statements.map((s) => s.text).join('\n').toUpperCase() };
}

/** The one spelling of the mark, in the interface language. */
export const CONTRADICTION_LABEL: Record<ContradictionVerdict, string> = {
  contradicts: 'Contradicts the evidence',
  unsupported: 'Not supported by the code',
};

/* ------------------------------------------------------------------ *
 * The anchor range.
 * ------------------------------------------------------------------ */

const OPENERS = new Set(['IF', 'CASE', 'LOOP', 'DO', 'WHILE', 'TRY']);
const CLOSERS = new Set(['ENDIF', 'ENDCASE', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDTRY', 'ENDAT']);
const BRANCHES = new Set(['ELSEIF', 'ELSE', 'WHEN', 'CATCH', 'CLEANUP']);
/** The widest range a single anchor is allowed to open. Beyond that it is a program, not a branch. */
const MAX_REGION = 60;

/** `AT NEW`, `AT END OF`, `AT FIRST`, `AT LAST` — control levels, not events (`AT SELECTION-SCREEN`). */
function isControlLevel(statement: AbapStatement): boolean {
  return statement.keyword === 'AT' && /^AT\s+(NEW|END\s+OF|FIRST|LAST)\b/i.test(statement.text);
}

function opens(statement: AbapStatement): boolean {
  return OPENERS.has(statement.keyword) || isControlLevel(statement);
}

/** The statements of the branch or block `statements[index]` opens, without the opener. */
function bodyOf(statements: readonly AbapStatement[], index: number): AbapStatement[] {
  const head = statements[index];
  const branch = BRANCHES.has(head.keyword) || head.keyword === 'IF';
  if (!branch && !opens(head)) return [];
  const body: AbapStatement[] = [];
  let depth = 0;
  for (let i = index + 1; i < statements.length && body.length < MAX_REGION; i++) {
    const s = statements[i];
    if (opens(s)) depth += 1;
    else if (CLOSERS.has(s.keyword)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && branch && BRANCHES.has(s.keyword)) break;
    body.push(s);
  }
  return body;
}

/** Every statement the sentence speaks about, once, in source order. */
function regionOf(source: ContradictionSource, anchors: readonly SourceRange[]): AbapStatement[] {
  const picked = new Set<number>();
  source.statements.forEach((s, i) => {
    if (!anchors.some((a) => s.lineStart <= a.lineEnd && a.lineStart <= s.lineEnd)) return;
    picked.add(i);
    for (const inner of bodyOf(source.statements, i)) picked.add(source.statements.indexOf(inner));
  });
  return [...picked].sort((a, b) => a - b).map((i) => source.statements[i]);
}

const rangeOf = (s: AbapStatement): SourceRange => ({ lineStart: s.lineStart, lineEnd: s.lineEnd });

/* ------------------------------------------------------------------ *
 * What the code at the anchors does.
 * ------------------------------------------------------------------ */

const isMessageInto = (s: AbapStatement) => s.keyword === 'MESSAGE' && /\sINTO\s/i.test(s.text);
const isMessageRaising = (s: AbapStatement) => s.keyword === 'MESSAGE' && /\sRAISING\s/i.test(s.text);
/** `WRITE x TO y` — a formatting assignment, not list output. */
const isWriteTo = (s: AbapStatement) => s.keyword === 'WRITE' && /\sTO\s+[^\s'"]/i.test(s.text) && !/^WRITE\s*:?\s*\//i.test(s.text);

/**
 * Could this statement put something in front of a user? Asked of everything
 * else at the anchors: when any of them could, "displayed" may be true and no
 * rule about a quiet `MESSAGE … INTO` fires.
 */
function mayDisplay(s: AbapStatement): boolean {
  if (s.keyword === 'MESSAGE') return !isMessageInto(s) && !isMessageRaising(s);
  if (s.keyword === 'WRITE') return !isWriteTo(s);
  if (['ULINE', 'SKIP', 'NEW-LINE', 'FORMAT', 'PERFORM', 'SUBMIT', 'CALL', 'RAISE', 'LEAVE', 'SET'].includes(s.keyword)) return true;
  // A functional method call or an ALV object: `lo_alv->display( ).`
  return /->|=>/.test(s.text);
}

/**
 * Could this statement change stored data, or hand the change to something that
 * does? Deliberately wide — a call, a routine, an itab write all count — so the
 * persistence rule only fires where the anchors plainly read and decide.
 * `SELECT` is not on the list: it reads, and a read beside a decision is
 * exactly the case the rule is for (QA review of 8f9ea35a000e, 61f4478991ab).
 */
function mayWrite(s: AbapStatement): boolean {
  return [
    'INSERT', 'UPDATE', 'MODIFY', 'DELETE', 'COMMIT', 'ROLLBACK', 'CALL', 'PERFORM', 'SUBMIT', 'APPEND',
    'COLLECT', 'EXPORT', 'SET', 'RAISE', 'OPEN', 'TRANSFER', 'EXEC',
  ].includes(s.keyword) || /->|=>/.test(s.text);
}

/* ------------------------------------------------------------------ *
 * What the sentence claims.
 * ------------------------------------------------------------------ */

/*
 * The model writes English since 01.10.2026 (prompt version 2, owner decision
 * "everything in English"); every pattern below reads the English wording and keeps
 * the German one, so a sentence in either language is judged the same way.
 */
/** "is displayed / output / shown" — the verb, not a noun like "Ausgabetabelle" or "the output list". */
const DISPLAYED =
  /\b(ausgegeben|angezeigt|ausgibt|anzeigt|zeigt\b[^.;]*\ban)\b|\b(is|are|was|were|be|been|gets?)\s+(?:then\s+)?(displayed|shown|output|printed)\b|\b(displays|shows|outputs|prints)\b/i;
/** "no message is displayed" claims the opposite, and a quiet statement agrees with it. */
const NOT_DISPLAYED =
  /\b(keine?|nicht|nie)\b[^.;,]{0,60}\b(ausgegeben|angezeigt)\b|\b(no|not|never|nothing)\b[^.;,]{0,60}\b(displayed|shown|output|printed)\b/i;
const claimsDisplay = (text: string) => DISPLAYED.test(text) && !NOT_DISPLAYED.test(text);
/** A message, as a sentence names one. */
const A_MESSAGE = /(meldung|nachricht|information\b|hinweis|warnung|fehlertext|message|notification|warning|error text)/i;
/** Message numbers the sentence names: `E110(ZSD)`, `110`, `S203`. */
function messageNumbers(text: string): string[] {
  return [...text.matchAll(/\b[EWISAX]?(\d{3})\b/gi)].map((m) => m[1]);
}
function messageNumberOf(s: AbapStatement): string | null {
  const short = /^MESSAGE\s+[EWISAX](\d{3})\b/i.exec(s.text);
  if (short) return short[1];
  const long = /\bNUMBER\s+'?(\d{3})'?/i.exec(s.text);
  return long ? long[1] : null;
}

const PROGRAM_ENDS =
  /\b(programm|report|programmausf(ü|ue)hrung|programmlauf)\w*\b[^.;]{0,60}\b(beendet|abgebrochen|verlassen)\b|\b(programm|report)\s+(endet|bricht\s+ab)\b|\b(program|report)\b[^.;]{0,60}\b(ends|ended|terminates|terminated|aborts|aborted|exits|exited|stops|stopped)\b/i;

/** Words that claim data was stored — never an internal table, a variable or a list. */
const STORED =
  /\b(gebucht|verbucht|persistiert|festgeschrieben|(in|auf|zur)\s+(der\s+|die\s+)?datenbank|posted|persisted|committed|(in|into|to)\s+the\s+database)\b/i;

const CREATED = /\b(angelegt|anlegen|anlage|neu\s+erfasst|erstellt|created|creates|creation|newly\s+entered)\b/i;

/**
 * SAP standard transactions that display a business object — a fixed list,
 * never a pattern. A customer code that happens to end in 03 (`ZVA03`) may do
 * whatever its author wrote, so an unknown code is never judged (QA review of
 * 8f9ea35a000e, 6fa011d784f8).
 */
export const STANDARD_DISPLAY_TRANSACTIONS: ReadonlySet<string> = new Set([
  'VA03', 'VA13', 'VA23', 'VA33', 'VA43', 'VL03N', 'VL33N', 'VF03', 'VK13', 'VBO3', 'VD03', 'XD03', 'FD03',
  'ME23N', 'ME33K', 'ME33L', 'ME53N', 'ME13', 'MM03', 'MB03', 'MIR4', 'XK03', 'MK03', 'FK03',
  'FB03', 'FS03', 'FSS3', 'KS03', 'KA03', 'CO03', 'CJ03', 'CN23', 'IW23', 'IW33', 'IW43', 'IE03', 'IL03',
  'IP03', 'QA03', 'QM03', 'CS03', 'CA03', 'CR03', 'CL03', 'PA20', 'AS03', 'CV03N',
]);

/* ------------------------------------------------------------------ *
 * The rules. Each returns a mark or nothing.
 * ------------------------------------------------------------------ */

function messageRules(text: string, region: AbapStatement[]): StatementContradiction | null {
  if (!claimsDisplay(text) || !A_MESSAGE.test(text)) return null;
  const messages = region.filter((s) => s.keyword === 'MESSAGE');
  if (messages.length === 0) return null;
  // A number in the sentence picks its statement; without one, every message
  // at the anchors must be a quiet one, and nothing else there may display.
  const numbers = messageNumbers(text);
  const named = numbers.length ? messages.filter((s) => numbers.includes(messageNumberOf(s) ?? '')) : [];
  if (named.length === 0 && numbers.length && messages.some((s) => messageNumberOf(s) !== null)) return null; // names another message
  // Named or not: when anything else at the anchors could put the message — or
  // the field `INTO` filled — in front of the user, "displayed" may be true
  // (QA review of 8f9ea35a000e, a4cdb3b68967: `MESSAGE … INTO gv_text`, then
  // `WRITE gv_text`).
  if (region.some((s) => s.keyword !== 'MESSAGE' && mayDisplay(s))) return null;
  const targets = named.length ? named : messages;
  if (targets.every(isMessageInto)) {
    return {
      verdict: 'contradicts',
      rule: 'message-into',
      reason: 'MESSAGE … INTO fills the message variables and displays nothing.',
      lines: targets.map(rangeOf),
    };
  }
  if (targets.every(isMessageRaising)) {
    return {
      verdict: 'unsupported',
      rule: 'message-raising',
      reason: 'MESSAGE … RAISING raises an exception; the message is shown only if the caller does not handle it.',
      lines: targets.map(rangeOf),
    };
  }
  return null;
}

function writeToRule(text: string, region: AbapStatement[]): StatementContradiction | null {
  if (!claimsDisplay(text) || A_MESSAGE.test(text)) return null;
  const writes = region.filter(isWriteTo);
  if (writes.length === 0 || region.some(mayDisplay)) return null;
  return {
    verdict: 'contradicts',
    rule: 'write-to',
    reason: 'WRITE … TO formats a value into a field; nothing is written to the list.',
    lines: writes.map(rangeOf),
  };
}

const EVENT_BLOCK = /^(START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|LOAD-OF-PROGRAM|TOP-OF-PAGE|END-OF-PAGE|GET)\b|^AT\s+(SELECTION-SCREEN|LINE-SELECTION|USER-COMMAND|PF\d+)\b/i;
const ROUTINE = /^(FORM|METHOD|FUNCTION|MODULE)\b/i;

function programEndRule(text: string, region: AbapStatement[], source: ContradictionSource): StatementContradiction | null {
  if (!PROGRAM_ENDS.test(text)) return null;
  if (region.some((s) => /^LEAVE\s+(PROGRAM|TO\s+TRANSACTION)\b/i.test(s.text) || s.keyword === 'SUBMIT')) return null;
  const exits = region.filter((s) => ['RETURN', 'EXIT', 'STOP'].includes(s.keyword));
  if (exits.length === 0) return null;
  const last = exits[exits.length - 1];
  const index = source.statements.indexOf(last);
  // The block the exit sits in: the nearest event or routine above it.
  let block: AbapStatement | null = null;
  for (let i = index - 1; i >= 0; i--) {
    const s = source.statements[i];
    if (EVENT_BLOCK.test(s.text) || ROUTINE.test(s.text)) { block = s; break; }
  }
  if (!block) return null;
  // An EXIT inside a loop leaves the loop, not the block — too far from the claim to judge.
  if (last.keyword === 'EXIT') {
    let depth = 0;
    for (let i = index - 1; i > source.statements.indexOf(block); i--) {
      const s = source.statements[i];
      if (['ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDSELECT'].includes(s.keyword)) depth += 1;
      else if (['LOOP', 'DO', 'WHILE'].includes(s.keyword) || (s.keyword === 'SELECT' && !/\bSINGLE\b|\bINTO\s+(CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\b/i.test(s.text))) {
        if (depth === 0) return null;
        depth -= 1;
      }
    }
  }
  if (ROUTINE.test(block.text)) {
    return {
      verdict: 'unsupported',
      rule: 'program-end',
      reason: `${last.keyword} leaves the ${block.keyword.toLowerCase() === 'form' ? 'routine' : block.keyword.toLowerCase()} ${block.text.split(/\s+/)[1] ?? ''}, not the program.`.replace(/\s+,/, ','),
      lines: [rangeOf(last)],
    };
  }
  const endOfSelection = source.statements.find((s) => /^END-OF-SELECTION\b/i.test(s.text));
  if (/^START-OF-SELECTION\b|^GET\b/i.test(block.text) && endOfSelection && endOfSelection.lineStart > block.lineStart) {
    return {
      verdict: 'contradicts',
      rule: 'program-end',
      reason: `${last.keyword} leaves START-OF-SELECTION only; END-OF-SELECTION at line ${endOfSelection.lineStart} still runs.`,
      lines: [rangeOf(last), rangeOf(endOfSelection)],
    };
  }
  return null;
}

function persistenceRule(text: string, region: AbapStatement[]): StatementContradiction | null {
  if (!STORED.test(text)) return null;
  if (region.length === 0 || region.some(mayWrite)) return null;
  return {
    verdict: 'unsupported',
    rule: 'persistence',
    reason: 'No statement at these lines writes to the database, commits or calls anything that could.',
    lines: region.map(rangeOf),
  };
}

function notRaisedRule(text: string, source: ContradictionSource): StatementContradiction | null {
  const match = /\b(Ausnahme|Exception|Ereignis|exception|event)\s+([A-Za-z][A-Za-z0-9_]{2,})\b/.exec(text);
  if (!match) return null;
  const name = match[2];
  // Only a technical name: an ordinary German word after "Ausnahme" is prose, not a claim.
  if (!/[_]/.test(name) && name !== name.toUpperCase()) return null;
  if (new RegExp(`\\b${name.replace(/[^A-Za-z0-9_]/g, '')}\\b`, 'i').test(source.upper)) return null;
  return {
    verdict: 'contradicts',
    rule: 'not-raised',
    reason: `The source names no ${/^(Ereignis|event)$/.test(match[1]) ? 'event' : 'exception'} ${name.toUpperCase()}.`,
    lines: [],
  };
}

function displayTransactionRule(text: string, region: AbapStatement[]): StatementContradiction | null {
  if (!CREATED.test(text)) return null;
  const calls = region.filter((s) => /^CALL\s+TRANSACTION\s+'([A-Z0-9_]+)'/i.test(s.text));
  if (calls.length === 0) return null;
  const codes = calls.map((s) => /^CALL\s+TRANSACTION\s+'([A-Z0-9_]+)'/i.exec(s.text)![1].toUpperCase());
  if (!codes.every((code) => STANDARD_DISPLAY_TRANSACTIONS.has(code))) return null;
  if (region.some((s) => mayWrite(s) && !/^CALL\s+TRANSACTION\b/i.test(s.text) && s.keyword !== 'SET')) return null;
  return {
    verdict: 'unsupported',
    rule: 'display-transaction',
    reason: `${codes.join(', ')} ${codes.length === 1 ? 'is a display transaction' : 'are display transactions'} in the SAP standard; nothing here creates a record.`,
    lines: calls.map(rangeOf),
  };
}

/**
 * The mark for one model sentence, or null when nothing at its anchors
 * disagrees with it. Null is the ordinary answer and says nothing about the
 * sentence being right — only that no rule here found it wrong.
 */
export function checkStatementAgainstCode(
  source: ContradictionSource,
  sentence: { text: string; anchors: readonly SourceRange[] },
): StatementContradiction | null {
  if (!sentence.text || sentence.anchors.length === 0) return null;
  const region = regionOf(source, sentence.anchors);
  if (region.length === 0) return null;
  return (
    messageRules(sentence.text, region) ??
    writeToRule(sentence.text, region) ??
    programEndRule(sentence.text, region, source) ??
    notRaisedRule(sentence.text, source) ??
    displayTransactionRule(sentence.text, region) ??
    persistenceRule(sentence.text, region)
  );
}
