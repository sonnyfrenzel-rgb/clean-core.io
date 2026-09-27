/**
 * Der Fachsatz — was ein Stück ABAP **fachlich** tut, in einem Satz am Element.
 *
 * Roadmap 17.7 (Weg A, entschieden von Sonny am 23.09.2026): die Engine erzeugt
 * ihn, deterministisch aus dem Quelltext, ohne Modellaufruf, ohne Netz und ohne
 * Schlüssel. Der Maßstab ist ein Fachbereichsmensch ohne ABAP-Kenntnis: nicht
 * „SELECT auf KNA1", sondern was an dieser Stelle fachlich geschieht. Die
 * Übersetzung dorthin steht in `business-glossary.ts`, sichtbar an einer Stelle.
 *
 * ## Die Abgrenzung zu Regel 6 — die einzige Stelle, an der sie geöffnet wird
 *
 * `process-skeleton.ts` sagt über seine Knotenbeschriftung: *„A token out of the
 * source. Never a phrase this engine made up (rule 6)."* Das bleibt so. Dieses
 * Modul ist eine **zweite, eigene Ebene**: es schreibt keine Beschriftung, es
 * ändert kein Skelett, und `process-skeleton.ts` importiert es nicht — die
 * Abhängigkeit zeigt nur in diese Richtung (`attachTo` unten nimmt ein fertiges
 * Skelett entgegen und gibt es unverändert zurück). Ein Fachsatz ist erklärter
 * Text; ein Knotenlabel bleibt ein wörtliches Token. Wer beides in eine Datei
 * legt, hebt Regel 6 auf, ohne es zu merken.
 *
 * ## Die schärfste Forderung: Unschärfe wird aufgelöst **und** ausgewiesen
 *
 * In dieser Reihenfolge. `not-determined` darf nie an die Stelle eines Satzes
 * treten. Ein Element, das statt einer Aussage „nicht bestimmt" trägt, erfüllt
 * 17.7 nicht — das wäre der bequeme Weg, bei jeder Lücke zu schweigen und das
 * Schweigen als Ehrlichkeit auszugeben.
 *
 * Also zwei Schritte, und der erste kommt zuerst:
 *
 * 1. **Auflösen.** Ein dynamischer Tabellenname, ein Bausteinname aus einer
 *    Variablen, ein Literal aus einer Konstanten: `resolveValue` sucht die
 *    Zuweisung im gelieferten Ausschnitt und setzt den gefundenen Wert in den
 *    Satz ein, mit der Zeile, aus der er kommt.
 * 2. **Ausweisen.** Was dabei offen bleibt, hängt als Vorbehalt **an** diesem
 *    Satz (`uncertainties`, und im `text` hinter dem Kernsatz) — nicht an seiner
 *    Stelle. `provenance` des Satzes ist immer `reconstructed`; `not-determined`
 *    trägt ausschließlich der einzelne Vorbehalt, also ein *Bestandteil* der
 *    Aussage.
 *
 * `assertStatementNeverReplacedByUncertainty` hält die Regel im Code fest und
 * läuft bei jedem Aufbau, nicht nur im Test.
 *
 * ## Darstellung, nicht Signatur
 *
 * Der Fachsatz gehört **nicht** in den signierten Payload. Das ist keine neue
 * Entscheidung, sondern die bestehende: `app/api/runs/create/route.ts` signiert
 * `Omit<…, 'analysis'>` — die Prosa eines Laufs ist ausdrücklich aus der
 * Signatur ausgenommen, während die Evidenz, aus der sie stammt, drin ist. Ein
 * Fachsatz ist aus derselben Evidenz gebildet und aus demselben Grund
 * ausgenommen: er ist eine Lesart, deren Wortlaut sich ändern darf, ohne dass
 * eine Quittung bricht. Signiert sind die Anker und die Evidenz dahinter.
 */

import { readStatements, type AbapStatement, type SourceRange } from './statement-reader';
import { isKnownField, nounPhrase, tableTerm, termFor, type BusinessTerm } from './business-glossary';
import { buildProcessFacts } from './process-facts';
import { readLuwStates, type LuwModel } from './luw-states';

/**
 * Ein Vorbehalt **an** einer Aussage — nie an ihrer Stelle.
 *
 * `provenance` ist hier `not-determined`, und das ist der einzige Ort im
 * Fachsatz, an dem dieser Wert vorkommen darf: er beschreibt einen Bestandteil
 * („welche Tabelle, entscheidet die Eingabe"), nie den Satz selbst.
 */
export interface StatementUncertainty {
  note: string;
  provenance: 'not-determined';
}

export interface BusinessStatement {
  /** Stabil über einen Lauf: `B` plus Startzeile und Art. */
  id: string;
  /** Der Kernsatz — die bestmögliche belegbare Aussage. Nie leer. */
  core: string;
  /**
   * Was am Element steht: Kern plus Vorbehalte, in einem Text. Kürze ist kein
   * Wert an sich (Forderung 2) — wo die Sache Details verlangt, stehen sie hier
   * und nicht in einer Liste daneben.
   */
  text: string;
  uncertainties: StatementUncertainty[];
  /** Engine-Sätze sind `reconstructed` (lib/provenance.ts). Nie etwas anderes. */
  provenance: 'reconstructed';
  /**
   * Jede ABAP-Anweisung, über die dieser Satz spricht. Nie leer.
   *
   * Mehrere, weil eine fachliche Aussage über mehrere Anweisungen gehen kann —
   * ein Wächter ist Bedingung, Ausgabe und Rücksprung zusammen, und wer auf
   * eine davon zeigt, meint dieselbe Sache.
   */
  anchors: SourceRange[];
  /**
   * Wie grob: `statement` für eine Anweisung, `group` für einen fachlichen
   * Block (Wächter, Ausgabeliste, Zweig mit Zuweisung).
   *
   * Die Oberfläche wählt danach: ein BPMN-Element aus mehreren Anweisungen
   * nimmt den `group`-Satz, eine einzelne Aktivität ihren eigenen.
   */
  grain: 'statement' | 'group';
}

// ---------------------------------------------------------------------------
// Schritt 1 — auflösen
// ---------------------------------------------------------------------------

export interface ResolvedValue {
  value: string | null;
  from: 'constant' | 'assignment' | 'literal' | 'unresolved';
  line: number | null;
}

const QUOTED = /^(?:'([^']*)'|`([^`]*)`)$/;

/** Ein Literal in Anführungszeichen, entkleidet. Sonst null. */
export function literalOf(text: string): string | null {
  const match = QUOTED.exec(text.trim());
  if (!match) return null;
  return match[1] ?? match[2] ?? '';
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Den Wert eines Bezeichners im gelieferten Ausschnitt suchen — Schritt 1.
 *
 * Gesucht wird nur, was **im Ausschnitt steht**: `CONSTANTS … VALUE 'X'` oder
 * eine Zuweisung `name = 'X'` vor der fragenden Stelle. Geraten wird nichts;
 * zwei verschiedene Zuweisungen sind keine Auflösung, sondern eine Verzweigung,
 * und kommen als `unresolved` zurück — also als Vorbehalt, nicht als Schweigen.
 */
export function resolveValue(
  name: string,
  statements: readonly AbapStatement[],
  before: number,
): ResolvedValue {
  const direct = literalOf(name);
  if (direct != null) return { value: direct, from: 'literal', line: null };
  const needle = name.trim().toLowerCase().replace(/^[@(]+/, '').replace(/[)]+$/, '');
  if (!needle) return { value: null, from: 'unresolved', line: null };
  let found: ResolvedValue = { value: null, from: 'unresolved', line: null };
  const seen = new Set<string>();
  for (const statement of statements) {
    if (statement.index >= before) break;
    const text = statement.text;
    const constant = new RegExp(
      `^CONSTANTS\\s+${escapeForRegExp(needle)}\\b[^=]*VALUE\\s+('[^']*'|\`[^\`]*\`)`,
      'i',
    ).exec(text);
    if (constant) {
      const value = literalOf(constant[1]);
      if (value != null) return { value, from: 'constant', line: statement.lineStart };
    }
    // `lv_x = 'A'` und ein `DATA(lv_x) = …` sind dieselbe Zuweisung.
    const assigned = new RegExp(
      `^(?:DATA\\()?${escapeForRegExp(needle)}\\)?\\s*=\\s*('[^']*'|\`[^\`]*\`)\\s*$`,
      'i',
    ).exec(text);
    if (assigned) {
      const value = literalOf(assigned[1]);
      if (value != null) {
        seen.add(value);
        found = { value, from: 'assignment', line: statement.lineStart };
      }
    }
  }
  if (seen.size > 1) return { value: null, from: 'unresolved', line: null };
  return found;
}

// ---------------------------------------------------------------------------
// Schritt 2 — ausweisen
// ---------------------------------------------------------------------------

/**
 * Die Regel aus 17.7, als Funktion statt als Vorsatz: sie wirft, wenn ein Satz
 * leer ist, eine fremde Herkunft trägt oder nicht verankert ist.
 */
export function assertStatementNeverReplacedByUncertainty(statement: BusinessStatement): void {
  if (!statement.core.trim()) {
    throw new Error(
      `Fachsatz ${statement.id} hat keinen Kernsatz. 17.7: „not-determined" darf nicht an die Stelle einer Aussage treten.`,
    );
  }
  if (statement.provenance !== 'reconstructed') {
    throw new Error(`Fachsatz ${statement.id} trägt eine fremde Herkunft — Engine-Sätze sind „reconstructed".`);
  }
  if (statement.anchors.length === 0) {
    throw new Error(`Fachsatz ${statement.id} ist nicht verankert.`);
  }
}

// ---------------------------------------------------------------------------
// Der Block, in dem eine Anweisung steht
// ---------------------------------------------------------------------------

type BlockKind = 'if' | 'elseif' | 'else' | 'loop' | 'case' | 'when' | 'routine' | 'try' | 'catch' | 'class';

interface Block {
  kind: BlockKind;
  head: AbapStatement;
  /** Bei `elseif`/`else`: die Bedingung des vorangegangenen Zweigs. */
  previous?: AbapStatement;
}

const OPENERS: Record<string, BlockKind> = {
  IF: 'if',
  LOOP: 'loop',
  DO: 'loop',
  WHILE: 'loop',
  CASE: 'case',
  TRY: 'try',
  FORM: 'routine',
  METHOD: 'routine',
  MODULE: 'routine',
  FUNCTION: 'routine',
  CLASS: 'class',
};

const CLOSERS = new Set([
  'ENDIF', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDCASE', 'ENDTRY', 'ENDFORM', 'ENDMETHOD', 'ENDMODULE', 'ENDFUNCTION',
  'ENDCLASS', 'ENDSELECT', 'ENDCATCH',
]);

/**
 * Welche `SELECT` eine Schleife öffnen — die, zu denen ein `ENDSELECT` gehört.
 *
 * Früher galt jedes `SELECT` ohne `INTO TABLE` und ohne `SINGLE` als Schleife.
 * Ein `INTO CORRESPONDING FIELDS OF TABLE`, ein `APPENDING TABLE` oder ein
 * `SELECT COUNT(*)` öffnet aber keine, und weil nie ein `ENDSELECT` kam, stand
 * danach **der ganze Rest des Programms** in einer erfundenen Schleife — mit
 * „Bei Treffern … als Liste" und „die Schleife läuft weiter" an Stellen, die in
 * keiner Schleife stehen. Gezählt wird deshalb gegen die `ENDSELECT`.
 */
function selectLoops(statements: readonly AbapStatement[]): Set<number> {
  const loops = new Set<number>();
  const open: number[] = [];
  for (const statement of statements) {
    const keyword = statement.keyword.toUpperCase();
    if (keyword === 'SELECT') {
      const text = statement.text;
      const table = /\b(?:INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\b/i.test(text);
      const aggregateOnly =
        /^SELECT\s+(?:SINGLE\s+)?(?:COUNT|MAX|MIN|SUM|AVG)\s*\(/i.test(text) && !/\bGROUP\s+BY\b/i.test(text);
      if (!table && !/\bSINGLE\b/i.test(text) && !aggregateOnly) open.push(statement.index);
    } else if (keyword === 'ENDSELECT') {
      const head = open.pop();
      if (head !== undefined) loops.add(head);
    }
  }
  return loops;
}

/** Was einen Block öffnet — die Tabelle oben plus die Sonderfälle, die ein Schlüsselwort allein nicht sagt. */
function opens(statement: AbapStatement, loops: ReadonlySet<number>): BlockKind | null {
  const keyword = statement.keyword.toUpperCase();
  if (keyword === 'SELECT') return loops.has(statement.index) ? 'loop' : null;
  // `CLASS x DEFINITION DEFERRED.` und `… LOAD.` haben kein ENDCLASS.
  if (keyword === 'CLASS' && /\bDEFINITION\s+(?:DEFERRED|LOAD)\b/i.test(statement.text)) return null;
  // `CATCH SYSTEM-EXCEPTIONS … ENDCATCH` ist ein eigener Block, kein Zweig eines TRY.
  if (keyword === 'CATCH' && /^CATCH\s+SYSTEM-EXCEPTIONS\b/i.test(statement.text)) return 'try';
  return OPENERS[keyword] ?? null;
}

/** Für jede Anweisung der Stapel der offenen Blöcke — ohne zweiten Parser. */
function blockStacks(statements: readonly AbapStatement[], loops: ReadonlySet<number>): Block[][] {
  const stacks: Block[][] = [];
  const stack: Block[] = [];
  for (const statement of statements) {
    const keyword = statement.keyword.toUpperCase();
    if (CLOSERS.has(keyword)) stack.pop();
    if (keyword === 'ELSEIF' || keyword === 'ELSE' || keyword === 'WHEN') {
      const previous = stack.pop();
      stack.push({
        kind: keyword === 'WHEN' ? 'when' : keyword === 'ELSE' ? 'else' : 'elseif',
        head: statement,
        previous: previous?.head,
      });
      stacks.push([...stack]);
      continue;
    }
    if (keyword === 'CATCH' && !/^CATCH\s+SYSTEM-EXCEPTIONS\b/i.test(statement.text)) {
      stack.pop();
      stack.push({ kind: 'catch', head: statement });
      stacks.push([...stack]);
      continue;
    }
    stacks.push([...stack]);
    const opener = opens(statement, loops);
    if (opener) stack.push({ kind: opener, head: statement });
  }
  return stacks;
}

// ---------------------------------------------------------------------------
// Die Einheit, die ein CHECK, RETURN oder EXIT verlässt
// ---------------------------------------------------------------------------

/** Die Ereignisse eines Reports — ein RETURN oder CHECK darin verlässt nur dieses Ereignis. */
const EVENT =
  /^(START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|LOAD-OF-PROGRAM|TOP-OF-PAGE(?:\s+DURING\s+LINE-SELECTION)?|END-OF-PAGE|AT\s+SELECTION-SCREEN(?:\s+OUTPUT|\s+ON\s+(?:VALUE-REQUEST\s+FOR\s+|HELP-REQUEST\s+FOR\s+|BLOCK\s+|RADIOBUTTON\s+GROUP\s+|END\s+OF\s+)?\S+)?|AT\s+LINE-SELECTION|AT\s+USER-COMMAND|AT\s+PF\d+)$/i;

/** Ein `GET knoten` — das Ereignis einer logischen Datenbank, nicht `GET PARAMETER`, `GET TIME` … */
const GET_NOT_LDB =
  /^GET\s+(?:PARAMETER|TIME|REFERENCE|BADI|CURSOR|PF-STATUS|LOCALE|BIT|RUN\s+TIME|DATASET|PROPERTY|PERMISSIONS)\b/i;

export function isLdbGet(text: string): boolean {
  return /^GET\s+[A-Za-z0-9_]+(?:\s+LATE)?(?:\s+FIELDS\b.*)?$/i.test(text.trim()) && !GET_NOT_LDB.test(text.trim());
}

function isEvent(statement: AbapStatement): boolean {
  return EVENT.test(statement.text.trim()) || isLdbGet(statement.text);
}

interface Unit {
  kind: 'loop' | 'routine' | 'event' | 'unknown';
  head: AbapStatement | null;
}

/**
 * Was ein `CHECK` an dieser Stelle verlässt: die innerste Schleife, sonst die
 * Routine, sonst das Ereignis. Das ist ABAP-Semantik, keine Auslegung — und die
 * Folge ist jeweils eine andere: ein übersprungener Durchlauf, eine verlassene
 * Routine, ein verlassener Ereignisblock.
 */
function enclosingUnit(statements: readonly AbapStatement[], stack: readonly Block[], index: number): Unit {
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    if (stack[i].kind === 'loop') return { kind: 'loop', head: stack[i].head };
    if (stack[i].kind === 'routine') return { kind: 'routine', head: stack[i].head };
  }
  for (let i = index - 1; i >= 0; i -= 1) {
    const other = statements[i];
    if (isEvent(other)) return { kind: 'event', head: other };
    if (/^(?:ENDFORM|ENDMETHOD|ENDFUNCTION|ENDMODULE|ENDCLASS)$/i.test(other.keyword)) break;
  }
  return { kind: 'unknown', head: null };
}

/** Die Routine mit ihrem Namen, im verlangten Fall: „das Unterprogramm pruefen". */
function routineLabel(head: AbapStatement, kasus: 'nom' | 'akk' = 'nom'): string {
  const match = /^(FORM|METHOD|MODULE|FUNCTION)\s+([A-Za-z0-9_~/]+)/i.exec(head.text);
  if (!match) return kasus === 'nom' ? 'die Routine' : 'die Routine';
  const name = match[2];
  switch (match[1].toUpperCase()) {
    case 'FORM':
      return `das Unterprogramm ${name}`;
    case 'METHOD':
      return `die Methode ${name}`;
    case 'MODULE':
      return `das Dialogmodul ${name}`;
    default:
      return `${kasus === 'nom' ? 'der' : 'den'} Funktionsbaustein ${name}`;
  }
}

/** Der Block, den ein CHECK oder RETURN außerhalb jeder Schleife verlässt — mit Namen. */
function unitLabel(unit: Unit, kasus: 'nom' | 'akk' = 'nom'): string {
  if (unit.kind === 'routine' && unit.head) return routineLabel(unit.head, kasus);
  if (unit.kind === 'event' && unit.head) {
    return `der Ereignisblock ${unit.head.text.trim().replace(/\s+/g, ' ').toUpperCase()}`.replace(
      /^der/,
      kasus === 'nom' ? 'der' : 'den',
    );
  }
  return kasus === 'nom' ? 'der aktuelle Verarbeitungsblock' : 'den aktuellen Verarbeitungsblock';
}

// ---------------------------------------------------------------------------
// Die Sprachbausteine
// ---------------------------------------------------------------------------

const range = (statement: AbapStatement): SourceRange => ({
  lineStart: statement.lineStart,
  lineEnd: statement.lineEnd,
});

/** Ein Bezeichner, wie ein Fachsatz ihn schreibt: ohne `@`, ohne Klammern. */
function plain(text: string): string {
  const inline = /^DATA\((\w+)\)$/i.exec(text.trim());
  if (inline) return inline[1];
  return text.trim().replace(/^[@(<]+/, '').replace(/[)>]+$/, '').trim();
}

/** Ob ein Bezeichner vom Selektionsbild kommt — `p_…`, `s_…`. */
function fromSelectionScreen(identifier: string): boolean {
  return /^[@]?[ps]_/i.test(identifier.trim());
}

/** Eine Aufzählung, wie man sie spricht: „A, B und C". */
function enumerate(parts: string[]): string {
  const unique = parts.filter((part, index) => part && parts.indexOf(part) === index);
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return `${unique.slice(0, -1).join(', ')} und ${unique[unique.length - 1]}`;
}

/**
 * Aus einer ABAP-Bedingung das **Subjekt** eines Fachsatzes.
 *
 * `iv_amount < 0` → „Negative Beträge", `p_amount > 20000` → „Beträge größer
 * 20000". Findet sich kein Muster, bleibt die Bedingung wörtlich stehen —
 * lieber technisch und wahr als fachlich und erfunden.
 */
function conditionSubject(condition: string): { subject: string; term: BusinessTerm | null; comparison: string | null } {
  const text = condition.replace(/^(IF|ELSEIF|WHILE|CHECK)\s+/i, '').trim();
  const compare = /^(\S+)\s*(<=|>=|<>|<|>|=)\s*(\S+)$/.exec(text);
  if (compare) {
    const [, left, operator, right] = compare;
    const word = termFor(left);
    const value = literalOf(right) ?? plain(right);
    if (operator === '<' && value === '0') return { subject: `Negative ${word.plural}`, term: word, comparison: operator };
    if (operator === '>=' && value === '0') return { subject: `Nicht negative ${word.plural}`, term: word, comparison: operator };
    if (operator === '>') return { subject: `${word.plural} größer ${value}`, term: word, comparison: operator };
    if (operator === '<') return { subject: `${word.plural} kleiner ${value}`, term: word, comparison: operator };
    if (operator === '<=') return { subject: `${word.plural} bis einschließlich ${value}`, term: word, comparison: operator };
    if (operator === '>=') return { subject: `${word.plural} ab ${value}`, term: word, comparison: operator };
    if (operator === '=') return { subject: `${word.plural} mit dem Wert ${value}`, term: word, comparison: operator };
    if (operator === '<>') return { subject: `${word.plural} ungleich ${value}`, term: word, comparison: operator };
  }
  const initial = /^(\S+)\s+IS\s+(NOT\s+)?INITIAL$/i.exec(text);
  if (initial) {
    const word = termFor(initial[1]);
    return {
      subject: initial[2] ? `Eine nicht leere ${word.singular}` : `Eine leere ${word.singular}`,
      term: word,
      comparison: null,
    };
  }
  return { subject: text, term: null, comparison: null };
}

const OPERATOR_WORDS: Record<string, string> = {
  '=': 'gleich',
  EQ: 'gleich',
  '<>': 'ungleich',
  NE: 'ungleich',
  '>': 'größer als',
  GT: 'größer als',
  '<': 'kleiner als',
  LT: 'kleiner als',
  '>=': 'mindestens',
  GE: 'mindestens',
  '<=': 'höchstens',
  LE: 'höchstens',
};

const TRUE_VALUES = /^(?:'X'|abap_true|b_true|c_true)$/i;
const FALSE_VALUES = /^(?:''|' '|space|abap_false|b_false|c_false)$/i;

/** Ein Vergleichswert, wie ein Satz ihn schreibt: Literal ohne Anführungszeichen, Bezeichner wie im Quelltext. */
function valueText(value: string): string {
  const literal = literalOf(value.replace(/\(\d+\)$/, ''));
  return literal ?? plain(value);
}

/**
 * Eine ABAP-Bedingung als **Nebensatz** — „der Betrag größer als 0 ist".
 *
 * Der Nebensatz trägt die Bedingung, wie sie ist: kein erfundenes „kleinere",
 * keine Umkehrung, kein erratenes Geschlecht (ein unbekannter Bezeichner heißt
 * „das Feld …"). Was sich nicht in einen einfachen Satz fassen lässt — eine
 * Verknüpfung mit AND/OR, ein Ausdruck —, steht wörtlich in Anführungszeichen.
 * Wörtlich ist technisch, aber wahr.
 *
 * `subrc` sagt, was `sy-subrc` an dieser Stelle bedeutet (F2); ohne Angabe
 * bleibt es beim neutralen „der Rückgabewert".
 */
function conditionClause(condition: string, subrc?: (value: string, equal: boolean) => string | null): string {
  const text = condition.replace(/^(IF|ELSEIF|WHILE|CHECK)\s+/i, '').trim();
  const literally = `die Bedingung „${text}“ erfüllt ist`;
  // Eine reine UND- oder reine ODER-Kette ohne Klammern ist eine Aufzählung
  // einfacher Bedingungen; jede Mischung und jede Klammer bleibt wörtlich.
  if (!/[()]/.test(text)) {
    for (const [connector, word] of [['AND', 'und'], ['OR', 'oder']] as const) {
      const parts = text.split(connector === 'AND' ? /\s+AND\s+/i : /\s+OR\s+/i);
      const other = connector === 'AND' ? /\sOR\s/i : /\sAND\s/i;
      if (parts.length > 1 && !other.test(text) && !/\bBETWEEN\b/i.test(text)) {
        const clauses = parts.map((part) => conditionClause(part, subrc));
        if (clauses.every((clause) => !clause.startsWith('die Bedingung'))) {
          return `${clauses.slice(0, -1).join(', ')} ${word} ${clauses[clauses.length - 1]}`;
        }
        return literally;
      }
    }
  }
  if (/\s(?:AND|OR|EQUIV)\s/i.test(text) || /^NOT\s/i.test(text)) return literally;

  const initial = /^(\S+)\s+IS\s+(NOT\s+)?INITIAL$/i.exec(text);
  if (initial) {
    if (/^sy-subrc$/i.test(initial[1])) {
      const phrase = subrc?.('0', !initial[2]);
      if (phrase) return phrase;
      return `der Rückgabewert (sy-subrc) ${initial[2] ? 'ungleich ' : ''}0 ist`;
    }
    return `${nounPhrase(initial[1])} ${initial[2] ? 'nicht ' : ''}leer ist`;
  }
  const bound = /^(\S+)\s+IS\s+(NOT\s+)?(BOUND|ASSIGNED|SUPPLIED|REQUESTED)$/i.exec(text);
  if (bound) {
    const word = { BOUND: 'gebunden', ASSIGNED: 'zugewiesen', SUPPLIED: 'versorgt', REQUESTED: 'angefordert' }[
      bound[3].toUpperCase() as 'BOUND'
    ];
    return `${nounPhrase(bound[1])} ${bound[2] ? 'nicht ' : ''}${word} ist`;
  }
  const selection = /^(\S+)\s+(NOT\s+)?IN\s+(\S+)$/i.exec(text);
  if (selection) {
    return `${nounPhrase(selection[1])} ${selection[2] ? 'nicht ' : ''}in der Selektion ${plain(selection[3])} liegt`;
  }
  const compare = /^(\S+)\s*(<=|>=|<>|<|>|=|\bEQ\b|\bNE\b|\bLT\b|\bGT\b|\bLE\b|\bGE\b)\s*(\S+)$/i.exec(text);
  if (compare) {
    const [, left, rawOperator, right] = compare;
    const operator = rawOperator.toUpperCase();
    const equal = operator === '=' || operator === 'EQ';
    const unequal = operator === '<>' || operator === 'NE';
    if (/^sy-subrc$/i.test(left) && (equal || unequal)) {
      const phrase = subrc?.(valueText(right), equal);
      if (phrase) return phrase;
      return `der Rückgabewert (sy-subrc) ${equal ? '' : 'ungleich '}${valueText(right)} ist`;
    }
    if ((equal || unequal) && (TRUE_VALUES.test(right) || FALSE_VALUES.test(right))) {
      const set = TRUE_VALUES.test(right) === equal;
      return `${nounPhrase(left)} ${set ? '' : 'nicht '}gesetzt ist`;
    }
    return `${nounPhrase(left)} ${OPERATOR_WORDS[operator]} ${valueText(right)} ist`;
  }
  const exists = /^line_exists\(\s*([A-Za-z0-9_\-<>]+)\[/i.exec(text);
  if (exists) return `in ${plain(exists[1])} eine passende Zeile existiert`;
  return literally;
}

/** Das Gegenstück zu `conditionSubject` für einen `ELSE`-Zweig. */
function elseSubject(previous: AbapStatement | undefined): string {
  if (!previous) return 'Sonst';
  const { subject, term, comparison } = conditionSubject(previous.text);
  if (!term || !comparison) return 'Sonst';
  if (comparison === '<' || comparison === '<=') return `Größere ${term.plural}`;
  if (comparison === '>' || comparison === '>=') return `Kleinere oder gleiche ${term.plural}`;
  return `Andere ${term.plural}`;
  void subject;
}

// ---------------------------------------------------------------------------
// Die Sätze
// ---------------------------------------------------------------------------

interface Draft {
  anchors: SourceRange[];
  core: string;
  notes?: string[];
  grain?: 'statement' | 'group';
  tag?: string;
  /** Nur am Wächter: wovor sein Rücksprung schützt (F11 führt ihn mit dem Zweig zusammen). */
  exit?: string;
  /** Nur am Wächter: sein Satzanfang, den der Zweig übernimmt. */
  subject?: Lead;
}

function build(draft: Draft): BusinessStatement {
  const notes = (draft.notes ?? []).filter((note) => note.trim().length > 0);
  const head = draft.anchors[0];
  const statement: BusinessStatement = {
    id: `B${head.lineStart}${draft.tag ? `-${draft.tag}` : ''}`,
    core: draft.core.trim(),
    text: [draft.core.trim(), ...notes].join(' '),
    uncertainties: notes.map((note) => ({ note, provenance: 'not-determined' as const })),
    provenance: 'reconstructed',
    anchors: draft.anchors,
    grain: draft.grain ?? 'statement',
  };
  assertStatementNeverReplacedByUncertainty(statement);
  return statement;
}

/**
 * Woher der Wert einer Variablen kommt — die zweite Auflösung (Schritt 1).
 *
 * „lv_output wird ausgegeben" sagt einem Fachbereichsmenschen nichts. „Das vom
 * Funktionsbaustein zurückgegebene Feld wird ausgegeben" sagt ihm, **warum**
 * dieser Wert an dieser Stelle steht. Gesucht wird nur, was im Ausschnitt
 * steht; was sich nicht zurückverfolgen lässt, behält seinen Namen.
 */
export type ValueOrigin = 'function-return' | 'method-return' | 'none';

const ORIGIN_TERMS: Record<Exclude<ValueOrigin, 'none'>, string> = {
  'function-return': 'Das vom Funktionsbaustein zurückgegebene Feld',
  'method-return': 'Der Rückgabewert',
};

function originMap(statements: readonly AbapStatement[]): Map<string, ValueOrigin> {
  const origins = new Map<string, ValueOrigin>();
  for (const statement of statements) {
    const text = statement.text;
    if (/^CALL\s+FUNCTION\b/i.test(text)) {
      for (const match of text.matchAll(/\b(?:IMPORTING|CHANGING|RECEIVING)\s+\w+\s*=\s*(\S+)/gi)) {
        origins.set(plain(match[1]).toLowerCase(), 'function-return');
      }
      continue;
    }
    if (/^RECEIVE\s+RESULTS\b/i.test(text)) {
      for (const match of text.matchAll(/\bIMPORTING\s+\w+\s*=\s*(\S+)/gi)) {
        origins.set(plain(match[1]).toLowerCase(), 'function-return');
      }
      continue;
    }
    if (/^CALL\s+METHOD\b/i.test(text)) {
      for (const match of text.matchAll(/\b(?:RECEIVING|IMPORTING|CHANGING)\s+\w+\s*=\s*(\S+)/gi)) {
        origins.set(plain(match[1]).toLowerCase(), 'method-return');
      }
      continue;
    }
    // `DATA(lv_x) = cls=>meth( … )` und `lv_x = obj->meth( … )`.
    const call = /^(?:DATA\()?([A-Za-z0-9_]+)\)?\s*=(?!>)\s*\S+(?:=>|->)\w+\s*\(/.exec(text);
    if (call) origins.set(call[1].toLowerCase(), 'method-return');
  }
  return origins;
}

/**
 * `WRITE x TO y` gibt nichts aus: es schreibt `x` formatiert in `y` (F5).
 * Nur ein `WRITE` ohne `TO` ist eine Listenausgabe.
 */
function isOutputWrite(statement: AbapStatement): boolean {
  return statement.keyword.toUpperCase() === 'WRITE' && !WRITE_TO.test(statement.text);
}

const WRITE_TO = /^WRITE\s+(.+?)\s+TO\s+([A-Za-z0-9_\-<>~]+(?:\+\d+)?(?:\(\d+\))?)(?:\s|$)/i;

/** Die Formatierungszusätze einer Listenausgabe — sie sagen, wie, nicht was ausgegeben wird. */
const WRITE_OPTIONS =
  /\s+(?:UNIT|CURRENCY|DECIMALS|EXPONENT|ROUND|TIME\s+ZONE|USING\s+(?:NO\s+)?EDIT\s+MASK|COLOR|INTENSIFIED|INVERSE|HOTSPOT|INPUT|FRAME|NO-GAP|NO-SIGN|NO-ZERO|NO-GROUPING|LEFT-JUSTIFIED|CENTERED|RIGHT-JUSTIFIED|UNDER|DD\/MM\/YY(?:YY)?|MM\/DD\/YY(?:YY)?|DDMMYY|MMDDYY|YYMMDD|AS\s+(?:CHECKBOX|ICON|SYMBOL|LINE)|QUICKINFO|ENVIRONMENT\s+TIME\s+FORMAT|STYLE)\b.*$/i;

/** Was ein `WRITE` ausgibt, ohne Position, Zeilenvorschub und Formatierung. */
function writeBody(statement: AbapStatement): string {
  return statement.text
    .replace(/^WRITE\s*/i, '')
    .replace(/^AT\s+/i, '')
    .replace(/^\/?\s*\d*(?:\(\*{0,2}\d*\))?\s+/, '')
    .replace(/^\/\s*/, '')
    .replace(WRITE_OPTIONS, '')
    .trim();
}

/** `WRITE / 'X'` oder `WRITE / lv_x` — der häufigste Anker des Korpus. */
function writtenTarget(
  statement: AbapStatement,
  origins?: Map<string, ValueOrigin>,
): { label: string; literal: boolean } {
  const body = writeBody(statement);
  // `'Text'(001)` ist ein Literal mit Textsymbol, `gv_x(10)` ein Ausschnitt.
  const literal = literalOf(body.replace(/^('[^']*')\(\w{1,3}\)$/, '$1'));
  if (literal != null) return { label: literal, literal: true };
  const cut = body.replace(/(?:\+\d+)?\(\d+\)$/, '');
  const origin = origins?.get(plain(cut).toLowerCase());
  if (origin && origin !== 'none') return { label: ORIGIN_TERMS[origin], literal: false };
  return { label: termFor(cut).singular, literal: false };
}

/** Der Satz zu `WRITE x TO y` — Formatierung in ein Feld, keine Ausgabe (F5). */
function writeToSentence(statement: AbapStatement): string | null {
  const match = WRITE_TO.exec(statement.text);
  if (!match) return null;
  const source = match[1].replace(/^\/\s*/, '');
  const shown = literalOf(source) ?? plain(source);
  return `Der Wert ${shown} wird aufbereitet in ${plain(match[2])} übernommen; ausgegeben wird dabei nichts.`;
}

const SELECT_LIST = /^SELECT\s+(?:SINGLE\s+)?(?:DISTINCT\s+)?(.+?)\s+FROM\s+/i;

/** Der Satz zu einem `SELECT` — die häufigste fachliche Aussage nach der Ausgabe. */
function selectSentence(statement: AbapStatement, statements: readonly AbapStatement[]): Draft {
  const text = statement.text;
  const anchors = [range(statement)];
  const notes: string[] = [];

  const fromMatch = /\bFROM\s+(\([^)]+\)|[A-Za-z0-9_/]+)/i.exec(text);
  const rawFrom = fromMatch ? plain(fromMatch[1]) : null;
  let entity: BusinessTerm | null = rawFrom ? tableTerm(rawFrom) : null;
  let subject = entity ? entity.plural : rawFrom ? `Sätze aus ${rawFrom}` : 'Sätze';

  if (fromMatch && /^\(/.test(fromMatch[1])) {
    const resolved = resolveValue(rawFrom ?? '', statements, statement.index);
    if (resolved.value) {
      entity = tableTerm(resolved.value);
      subject = entity ? entity.plural : `Sätze aus ${resolved.value}`;
      notes.push(
        `Die Tabelle ist über ${resolved.from === 'constant' ? 'die Konstante' : 'die Zuweisung'} in Zeile ${resolved.line} festgelegt.`,
      );
    } else {
      notes.push('Welche Tabelle das ist, entscheidet die Eingabe zur Laufzeit.');
    }
  }

  // Das WHERE, als fachliche Einschränkung gelesen.
  const where = /\bWHERE\s+(.+?)(?:\s+(?:ORDER\s+BY|GROUP\s+BY|INTO|UP\s+TO)\b|$)/i.exec(text);
  const filters: string[] = [];
  let dynamicPredicate = false;
  if (where) {
    if (/^\(.+\)$/.test(where[1].trim())) {
      dynamicPredicate = true;
    } else {
      for (const part of where[1].split(/\s+AND\s+/i)) {
        const compare = /^(\S+)\s*=\s*(\S+)$/.exec(part.trim());
        if (!compare) continue;
        const word = termFor(compare[1]);
        if (fromSelectionScreen(compare[2])) filters.push(`dem eingegebenen ${word.singular}`);
        else if (/^@?sy-mandt$/i.test(compare[2])) filters.push('dem Anmeldemandanten');
      }
    }
  }
  const restriction = filters.length > 0 ? ` mit ${enumerate(filters)}` : '';

  if (/\bCOUNT\s*\(/i.test(text)) {
    if (dynamicPredicate) {
      notes.push('Welche Sätze das sind, entscheidet die Eingabe zur Laufzeit.');
    }
    return {
      anchors,
      core: `Die Zahl der ${entity ? entity.plural : 'Sätze'}${restriction} wird ermittelt.`,
      notes,
      tag: 'select',
    };
  }

  if (/\bWITH\s+PRIVILEGED\s+ACCESS\b/i.test(text)) {
    notes.push('Die Zugriffskontrolle der Entität wird dabei umgangen.');
  }
  if (/\bCLIENT\s+SPECIFIED\b/i.test(text)) {
    notes.push('Die Mandantenbegrenzung steht ausdrücklich im Prädikat, nicht in der Automatik.');
  }
  if (dynamicPredicate) {
    notes.push('Welche Sätze das sind, entscheidet die Eingabe zur Laufzeit.');
  }

  const list = SELECT_LIST.exec(text);
  const single = /\bSINGLE\b/i.test(text);
  if (single && list) {
    const fields = list[1]
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field && !/^\*$/.test(field));
    const named = fields.map((field) => termFor(field).singular);
    if (named.length > 0 && named.length <= 3) {
      return {
        anchors,
        core: `${enumerate(named)} des ${entity ? entity.genitive : 'Satzes'}${restriction} ${named.length > 1 ? 'werden' : 'wird'} gelesen.`,
        notes,
        tag: 'select',
      };
    }
  }

  return { anchors, core: `Es werden ${subject}${restriction} selektiert.`, notes, tag: 'select' };
}

/**
 * Die Feldliste eines `SELECT` als eigener Satz: **was im Ergebnis steht.**
 *
 * „Das Ergebnis enthält Kundennummer, Buchungskreis und Abstimmkonto" ist eine
 * andere fachliche Aussage als „es werden Kunden selektiert" — die eine sagt,
 * *welche* Sätze kommen, die andere, *was* an ihnen bekannt ist. Das Fallbuch
 * führt beide, und die Business-Sicht zeigt beide am selben Element.
 */
function resultFieldsSentence(statement: AbapStatement): Draft | null {
  if (statement.keyword.toUpperCase() !== 'SELECT') return null;
  const list = SELECT_LIST.exec(statement.text);
  if (!list || /COUNT\s*\(/i.test(statement.text)) return null;
  const fields = list[1]
    .split(',')
    .map((field) => field.trim())
    .filter((field) => field && field !== '*');
  if (fields.length < 2 || fields.length > 6) return null;
  const named = fields.map((field) => termFor(field).singular);
  return {
    anchors: [range(statement)],
    core: `Das Ergebnis enthält ${enumerate(named)}.`,
    tag: 'fields',
  };
}

// ---------------------------------------------------------------------------
// Was `sy-subrc` an einer Stelle bedeutet (F2)
// ---------------------------------------------------------------------------

/**
 * Der Anfang eines Satzes über eine Bedingung: entweder eine Wendung („Ohne
 * Treffer wird …") oder ein vorangestellter Bedingungssatz („Ist die Sperre
 * nicht zu erhalten, wird …"). Der Unterschied ist nur das Komma.
 */
interface Lead {
  text: string;
  clause: boolean;
}

const lead = (text: string, clause = false): Lead => ({ text, clause });

/** „Ohne Treffer wird X" oder „Ist die Sperre nicht zu erhalten, wird X". */
function compose(subject: Lead, rest: string): string {
  return `${subject.text}${subject.clause ? ',' : ''} wird ${rest}`;
}

/** Beide Ausgänge einer `sy-subrc`-Prüfung, als Satzanfang und als Nebensatz. */
interface SubrcOutcome {
  fail: Lead;
  ok: Lead;
  failClause: string;
  okClause: string;
}

const outcome = (fail: Lead, ok: Lead, failClause: string, okClause: string): SubrcOutcome => ({
  fail,
  ok,
  failClause,
  okClause,
});

/** Wo die setzende Anweisung nicht eindeutig ist, bleibt es neutral. */
function neutralOutcome(value = '0'): SubrcOutcome {
  return outcome(
    lead(`Bei Rückgabewert ungleich ${value}`),
    lead(`Bei Rückgabewert ${value}`),
    `der Rückgabewert (sy-subrc) ungleich ${value} ist`,
    `der Rückgabewert (sy-subrc) ${value} ist`,
  );
}

/** Namen, die im ganzen Ausschnitt als interne Tabelle deklariert oder gefüllt werden. */
function internalTables(statements: readonly AbapStatement[]): Set<string> {
  const names = new Set<string>();
  for (const statement of statements) {
    const text = statement.text;
    const declared = /^(?:DATA|STATICS|CLASS-DATA)\s+([A-Za-z0-9_]+)\s+(?:TYPE|LIKE)\s+(?:(?:STANDARD|SORTED|HASHED|ANY|INDEX)\s+)?(?:TABLE|RANGE)\s+OF\b/i.exec(text);
    if (declared) names.add(declared[1].toLowerCase());
    for (const match of text.matchAll(/\b(?:INTO|APPENDING)\s+(?:CORRESPONDING\s+FIELDS\s+OF\s+)?TABLE\s+@?(?:DATA\()?([A-Za-z0-9_]+)\)?/gi)) {
      names.add(match[1].toLowerCase());
    }
    const tables = /^FORM\s+\S+\s+TABLES\s+(.+?)(?:\s+(?:USING|CHANGING|RAISING)\s+.*)?$/i.exec(text);
    if (tables) {
      const words = tables[1].split(/\s+/);
      for (let i = 0; i < words.length; i += 1) {
        if (/^(?:STRUCTURE|TYPE|LIKE)$/i.test(words[i])) i += 1;
        else if (/^[A-Za-z_]\w*$/.test(words[i])) names.add(words[i].toLowerCase());
      }
    }
  }
  return names;
}

/** Ob ein Schreibziel eine interne Tabelle (oder das Bild) ist statt einer Datenbanktabelle. */
function writesInternally(statement: AbapStatement, tables: ReadonlySet<string>): boolean {
  const text = statement.text;
  const keyword = statement.keyword.toUpperCase();
  if (/^MODIFY\s+(?:SCREEN|LINE|CURRENT\s+LINE|TABLE)\b/i.test(text)) return true;
  if (/^(?:INSERT|DELETE)\s+(?:LINES\s+OF|TABLE|ADJACENT\s+DUPLICATES)\b/i.test(text)) return true;
  if (/\bINTO\s+TABLE\b|\bINDEX\b|\bTRANSPORTING\b|\bASSIGNING\b|\bREFERENCE\s+INTO\b/i.test(text)) return true;
  if (keyword === 'UPDATE') return false;
  const target =
    /^(?:INSERT\s+INTO|DELETE\s+FROM|MODIFY|INSERT|DELETE)\s+(\(?[A-Za-z0-9_/<>~-]+\)?)/i.exec(text)?.[1] ?? '';
  const name = target.replace(/[()]/g, '').toLowerCase();
  if (/^</.test(name) || INTERNAL_TABLE.test(name) || /^[mgl]t_|^[xy][a-z]/.test(name) || tables.has(name)) {
    // `xvbap`, `yvbap` sind die Vorher/Nachher-Tabellen der Exits; eine
    // Datenbanktabelle beginnt nicht mit x oder y, eine Z-Tabelle mit z.
    return tableTerm(name) === null;
  }
  return false;
}

/** Ob eine Anweisung in die Datenbank schreibt — nicht in eine interne Tabelle, nicht auf das Bild. */
function isDbWrite(statement: AbapStatement, tables: ReadonlySet<string>): boolean {
  if (!DB_WRITE.test(statement.text)) return false;
  if (/^(?:UPDATE|MODIFY|INSERT|DELETE)\b/i.test(statement.text) && !/^MODIFY\s+ENTITIES\b/i.test(statement.text)) {
    return !writesInternally(statement, tables);
  }
  return true;
}

/** Die Anweisungen, die `sy-subrc` nicht anfassen — über sie hinweg wird weitergesucht. */
const SUBRC_NEUTRAL = new Set([
  'WRITE', 'CLEAR', 'FREE', 'REFRESH', 'DATA', 'CONSTANTS', 'TYPES', 'FIELD-SYMBOLS', 'STATICS', 'MESSAGE', 'ADD',
  'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'CONDENSE', 'TRANSLATE', 'APPEND', 'COLLECT', 'ULINE', 'SKIP', 'NEW-LINE',
  'FORMAT', 'SORT', 'MOVE', 'MOVE-CORRESPONDING', 'CONCATENATE', 'SPLIT', 'SHIFT', 'GET',
]);

/**
 * Die Anweisung, die das geprüfte `sy-subrc` gesetzt hat — oder `null`, wenn
 * das aus dem Code nicht eindeutig folgt.
 *
 * Gesucht wird rückwärts, über Zuweisungen, Ausgaben und Kopien von
 * `sy-subrc` hinweg. Eine Blockgrenze (`ENDIF`, `ELSE`, `ENDTRY` …) oder ein
 * Aufruf, dessen Inneres `sy-subrc` setzen kann (`PERFORM`, Methode), beendet
 * die Suche ohne Ergebnis: dann ist der Satz neutral statt geraten.
 */
function subrcSetter(statements: readonly AbapStatement[], before: number): AbapStatement | null {
  for (let i = before - 1; i >= 0; i -= 1) {
    const statement = statements[i];
    if (statement.nativeSql) continue;
    const keyword = statement.keyword.toUpperCase();
    const text = statement.text;
    if (keyword === 'ENDLOOP' || keyword === 'ENDSELECT' || keyword === 'ENDCATCH') {
      // Der Kopf der Schleife ist die setzende Anweisung.
      let depth = 0;
      const opener = keyword === 'ENDLOOP' ? 'LOOP' : keyword === 'ENDSELECT' ? 'SELECT' : 'CATCH';
      for (let j = i - 1; j >= 0; j -= 1) {
        const k = statements[j].keyword.toUpperCase();
        if (k === keyword) depth += 1;
        else if (k === opener && (opener !== 'SELECT' || !/\bSINGLE\b|\bTABLE\b/i.test(statements[j].text))) {
          if (depth === 0) return statements[j];
          depth -= 1;
        }
      }
      return null;
    }
    if (keyword === 'ENDEXEC') return statement;
    if (SUBRC_NEUTRAL.has(keyword) && !(keyword === 'GET' && /^GET\s+PARAMETER\b/i.test(text))) continue;
    // Eine Zuweisung ohne Methodenaufruf, auch die Kopie `lv_rc = sy-subrc`.
    if (/^(?:DATA\()?[A-Za-z0-9_\-<>~]+\)?\s*(?:[-+*/]|&&)?=\s/.test(text) && !/->|=>/.test(text)) continue;
    return statement;
  }
  return null;
}

/** Was `sy-subrc` nach genau dieser Anweisung bedeutet. */
function outcomeOf(setter: AbapStatement | null, statements: readonly AbapStatement[], value: string): SubrcOutcome {
  if (!setter || value !== '0') return neutralOutcome(value);
  const text = setter.text;
  const keyword = setter.keyword.toUpperCase();
  const found = () =>
    outcome(lead('Ohne Treffer'), lead('Bei Treffer'), 'kein Treffer vorliegt', 'ein Treffer vorliegt');
  if (keyword === 'SELECT' || keyword === 'LOOP' || keyword === 'FIND' || keyword === 'SEARCH') return found();
  if (keyword === 'READ' && /^READ\s+TABLE\b/i.test(text)) return found();
  if (keyword === 'READ' && /^READ\s+DATASET\b/i.test(text)) {
    return outcome(
      lead('Ist das Dateiende erreicht', true),
      lead('Wurde ein Satz gelesen', true),
      'das Dateiende erreicht ist',
      'ein Satz gelesen wurde',
    );
  }
  if (keyword === 'AUTHORITY-CHECK') {
    const object = /OBJECT\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    const name = object ? (literalOf(object[1]) ?? object[1]) : '';
    const field = /ID\s+'[^']*'\s+FIELD\s+([ps]_\w+)/i.exec(text);
    const restriction = field ? ` für den eingegebenen ${termFor(field[1]).singular}` : '';
    return outcome(
      lead(`Ohne Berechtigung auf ${name}${restriction}`),
      lead(`Mit Berechtigung auf ${name}${restriction}`),
      `die Berechtigung auf ${name} fehlt`,
      `die Berechtigung auf ${name} vorliegt`,
    );
  }
  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) {
      const name = resolveValue(fn[1], statements, setter.index).value ?? plain(fn[1]);
      if (/^ENQUEUE_/i.test(name)) {
        return outcome(
          lead(`Ist die Sperre über ${name} nicht zu erhalten`, true),
          lead(`Ist die Sperre über ${name} gesetzt`, true),
          `die Sperre über ${name} nicht zu erhalten ist`,
          `die Sperre über ${name} gesetzt ist`,
        );
      }
      return outcome(
        lead(`Scheitert der Aufruf von ${name}`, true),
        lead(`Gelingt der Aufruf von ${name}`, true),
        `der Aufruf von ${name} scheitert`,
        `der Aufruf von ${name} gelingt`,
      );
    }
    const transaction = /^CALL\s+TRANSACTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (transaction) {
      const name = literalOf(transaction[1]) ?? transaction[1];
      return outcome(
        lead(`Meldet die Transaktion ${name} einen Fehler`, true),
        lead(`Läuft die Transaktion ${name} ohne Fehler`, true),
        `die Transaktion ${name} einen Fehler meldet`,
        `die Transaktion ${name} ohne Fehler läuft`,
      );
    }
    const method = /^CALL\s+METHOD\s+\S*?([A-Za-z0-9_]+)\s*(?:\(|$|\s)/i.exec(text);
    if (method && /\bEXCEPTIONS\b/i.test(text)) {
      return outcome(
        lead(`Scheitert der Aufruf von ${method[1]}`, true),
        lead(`Gelingt der Aufruf von ${method[1]}`, true),
        `der Aufruf von ${method[1]} scheitert`,
        `der Aufruf von ${method[1]} gelingt`,
      );
    }
    return neutralOutcome(value);
  }
  if (/->|=>/.test(text) && /\bEXCEPTIONS\b/i.test(text)) {
    const method = /(?:->|=>)([A-Za-z0-9_]+)\s*\(/.exec(text);
    if (method) {
      return outcome(
        lead(`Scheitert der Aufruf von ${method[1]}`, true),
        lead(`Gelingt der Aufruf von ${method[1]}`, true),
        `der Aufruf von ${method[1]} scheitert`,
        `der Aufruf von ${method[1]} gelingt`,
      );
    }
  }
  if (keyword === 'OPEN' && /^OPEN\s+DATASET\b/i.test(text)) {
    return outcome(
      lead('Lässt sich die Datei nicht öffnen', true),
      lead('Ist die Datei geöffnet', true),
      'die Datei sich nicht öffnen lässt',
      'die Datei geöffnet ist',
    );
  }
  if (['INSERT', 'UPDATE', 'MODIFY', 'DELETE'].includes(keyword)) {
    const what = writesInternally(setter, internalTables(statements)) ? 'die Tabellenänderung' : 'die Datenbankänderung';
    return outcome(
      lead(`Schlägt ${what} fehl`, true),
      lead(`Gelingt ${what}`, true),
      `${what} fehlschlägt`,
      `${what} gelingt`,
    );
  }
  if (keyword === 'RECEIVE') {
    return outcome(
      lead('Scheitert die Rückmeldung der parallelen Task', true),
      lead('Liegt die Rückmeldung der parallelen Task vor', true),
      'die Rückmeldung der parallelen Task scheitert',
      'die Rückmeldung der parallelen Task vorliegt',
    );
  }
  if (keyword === 'CATCH') {
    return outcome(
      lead('Ist eine Ausnahme aufgetreten', true),
      lead('Ist keine Ausnahme aufgetreten', true),
      'eine Ausnahme aufgetreten ist',
      'keine Ausnahme aufgetreten ist',
    );
  }
  if (keyword === 'EXEC' || keyword === 'ENDEXEC') {
    return outcome(
      lead('Scheitert die Native-SQL-Anweisung', true),
      lead('Gelingt die Native-SQL-Anweisung', true),
      'die Native-SQL-Anweisung scheitert',
      'die Native-SQL-Anweisung gelingt',
    );
  }
  if (keyword === 'ASSIGN') {
    return outcome(
      lead('Lässt sich das Feld nicht zuweisen', true),
      lead('Ist das Feld zugewiesen', true),
      'das Feld sich nicht zuweisen lässt',
      'das Feld zugewiesen ist',
    );
  }
  if (keyword === 'GET' && /^GET\s+PARAMETER\b/i.test(text)) {
    return outcome(
      lead('Ist der Benutzerparameter nicht gesetzt', true),
      lead('Ist der Benutzerparameter gesetzt', true),
      'der Benutzerparameter nicht gesetzt ist',
      'der Benutzerparameter gesetzt ist',
    );
  }
  if (keyword === 'COMMIT' && /\bAND\s+WAIT\b/i.test(text)) {
    return outcome(
      lead('Scheitert die Verbuchung', true),
      lead('Gelingt die Verbuchung', true),
      'die Verbuchung scheitert',
      'die Verbuchung gelingt',
    );
  }
  return neutralOutcome(value);
}

/**
 * Was `sy-subrc` (oder eine Kopie davon) an der Stelle `index` bedeutet.
 *
 * Für eine Kopie `lv_rc = sy-subrc` zählt die Anweisung vor der Kopie, nicht
 * vor der Prüfung — dazwischen kann beliebig viel stehen.
 */
function subrcOutcome(statements: readonly AbapStatement[], index: number, variable = 'sy-subrc', value = '0'): SubrcOutcome {
  let from = index;
  if (!/^sy-subrc$/i.test(variable)) {
    const needle = variable.toLowerCase();
    from = -1;
    for (let i = index - 1; i >= 0; i -= 1) {
      const copy = /^(?:DATA\()?([A-Za-z0-9_]+)\)?\s*=\s*sy-subrc\s*$/i.exec(statements[i].text);
      if (copy && copy[1].toLowerCase() === needle) {
        from = i;
        break;
      }
    }
    if (from < 0) return neutralOutcome(value);
  }
  return outcomeOf(subrcSetter(statements, from), statements, value);
}

/** Der Nebensatz zu `sy-subrc = value` an dieser Stelle — für `conditionClause`. */
function subrcClauseAt(statements: readonly AbapStatement[], index: number) {
  return (value: string, equal: boolean): string => {
    const result = subrcOutcome(statements, index, 'sy-subrc', value);
    return equal ? result.okClause : result.failClause;
  };
}

/**
 * Der Satzanfang zu `IF x IS [NOT] INITIAL`.
 *
 * „Ohne Treffer" ist nur wahr, wenn die leere Tabelle das Ergebnis eines
 * Lesens ist — ein `SELECT … INTO TABLE` in genau diese Tabelle. Sonst ist sie
 * einfach leer, und so steht es auch da.
 */
function initialLead(name: string, statements: readonly AbapStatement[], index: number, negated: boolean): Lead {
  const needle = plain(name).toLowerCase();
  const filledBySelect = statements
    .slice(0, index)
    .some(
      (other) =>
        other.keyword.toUpperCase() === 'SELECT' &&
        new RegExp(`\\b(?:INTO|APPENDING)\\s+(?:CORRESPONDING\\s+FIELDS\\s+OF\\s+)?TABLE\\s+@?(?:DATA\\()?${escapeForRegExp(needle)}\\b`, 'i').test(other.text),
    );
  if (INTERNAL_TABLE.test(name) || internalTables(statements).has(needle)) {
    if (filledBySelect) return lead(negated ? 'Bei Treffern' : 'Ohne Treffer');
    return lead(negated ? `Enthält die Tabelle ${plain(name)} Zeilen` : `Ist die Tabelle ${plain(name)} leer`, true);
  }
  if (isKnownField(name)) {
    const word = termFor(name).singular;
    return lead(negated ? `Mit einer nicht leeren ${word}` : `Ohne ${word}`);
  }
  return lead(`Ist ${nounPhrase(name)} ${negated ? 'nicht ' : ''}leer`, true);
}

/** Die Wächter: `IF … . WRITE 'X'. RETURN.` — Bedingung, Ausgabe und Rücksprung als eine Aussage. */
function guardSentence(
  statements: readonly AbapStatement[],
  index: number,
  origins: Map<string, ValueOrigin>,
  context: SourceContext,
): Draft | null {
  const head = statements[index];
  if (head.keyword.toUpperCase() !== 'IF') return null;
  const initial = /^IF\s+(\S+)\s+IS\s+INITIAL\s*$/i.exec(head.text);
  // Ein `DATA(lv_auth_result) = sy-subrc.` ist eine Kopie, kein anderer Wert —
  // der Wächter dahinter prüft dieselbe Sache und wird auch so gelesen.
  const subrcNames = new Set(['sy-subrc']);
  for (const other of statements.slice(0, index)) {
    const copy = /^(?:DATA\()?([A-Za-z0-9_]+)\)?\s*=\s*sy-subrc\s*$/i.exec(other.text);
    if (copy) subrcNames.add(copy[1].toLowerCase());
  }
  const compared = /^IF\s+(\S+)\s*(<>|=)\s*0\s*$/i.exec(head.text);
  const subrc = compared && subrcNames.has(compared[1].toLowerCase()) ? [compared[0], compared[2]] : null;
  const compare = /^IF\s+(\S+)\s*(<>|=)\s*('[^']*'|\S+)\s*$/i.exec(head.text);

  // Der Rumpf des Wächters, nur seine eigene Ebene: ein RETURN in einer
  // inneren Schleife oder einem inneren IF gehört nicht ihm.
  const body: AbapStatement[] = [];
  let depth = 0;
  for (let i = index + 1; i < statements.length; i += 1) {
    const next = statements[i];
    const keyword = next.keyword.toUpperCase();
    if (depth === 0 && (keyword === 'ENDIF' || keyword === 'ELSE' || keyword === 'ELSEIF')) break;
    if (opens(next, context.loops)) depth += 1;
    else if (CLOSERS.has(keyword)) depth -= 1;
    else if (depth === 0) body.push(next);
    if (body.length > 4) break;
  }
  const write = body.find((s) => isOutputWrite(s));
  const leave = body.find((s) => ['RETURN', 'LEAVE', 'EXIT'].includes(s.keyword.toUpperCase()));
  if (!leave) return null;

  let subject: Lead;
  if (initial) subject = initialLead(initial[1], statements, index, false);
  else if (subrc) {
    // Ein `sy-subrc` sagt für sich nichts. Was es bedeutet, sagt die Anweisung,
    // die es gesetzt hat (F2): nach einer Berechtigungsprüfung heißt „<> 0"
    // fehlende Berechtigung, nach einer Sperre eine nicht erhaltene Sperre,
    // nach einem Lesen fehlender Treffer.
    const outcome = subrcOutcome(statements, index, compared![1]);
    subject = subrc[1] === '<>' ? outcome.fail : outcome.ok;
  }
  else if (compare) {
    // Ein Kennzeichen ist im ABAP ein `= 'X'`; fachlich ist es „gesetzt" oder
    // „nicht gesetzt", und genau so liest es ein Fachbereichsmensch.
    const value = literalOf(compare[3]) ?? plain(compare[3]);
    const name = plain(compare[1]);
    if (/^sy-subrc$/i.test(name)) {
      // Ein anderer Wert als 0: was er heißt, sagt nur die Dokumentation der
      // setzenden Anweisung — der Satz bleibt neutral.
      const neutral = neutralOutcome(value);
      subject = compare[2] === '=' ? neutral.ok : neutral.fail;
    } else if (value === 'X') {
      subject = lead(compare[2] === '=' ? `Mit gesetztem ${name}` : `Ohne gesetztes ${name}`);
    } else {
      subject = lead(compare[2] === '=' ? `Bei ${name} gleich ${value}` : `Bei ${name} ungleich ${value}`);
    }
  } else return null;

  const anchors = [range(head), ...(write ? [range(write)] : []), range(leave)];
  const label = write ? writtenTarget(write, origins).label : null;
  const exit = guardExit(statements, index, body, leave, context);
  const core = label
    ? `${compose(subject, `${label} ausgegeben und ${exit}`)}.`
    : `${compose(subject, exit)}.`;
  return { anchors, core, grain: 'group', tag: 'guard', exit, subject };
}

/** Was eine Datenbankzeile ändern kann — die Liste, auf die sich der Wächter beruft. */
const DB_WRITE = /^(UPDATE|MODIFY|INSERT|DELETE|EXEC\s+SQL)\b|execute_update|CALL\s+TRANSACTION|IN\s+UPDATE\s+TASK/i;

/** Was über eine ganze Quelle einmal gelesen wird und viele Sätze brauchen. */
interface SourceContext {
  stacks: Block[][];
  loops: ReadonlySet<number>;
  tables: Set<string>;
}

/**
 * Ob das Ziel eines Aufrufs im gelieferten Code steht — `FORM x`, `METHOD x`,
 * `FUNCTION x`. Nur dann lässt sich über seine Wirkung etwas sagen.
 */
function definedInSource(statement: AbapStatement, statements: readonly AbapStatement[]): boolean {
  const text = statement.text;
  if (/^COMMIT\b/i.test(text)) return true;
  const perform = /^PERFORM\s+([A-Za-z0-9_]+)/i.exec(text);
  if (perform) return !/\bIN\s+PROGRAM\b/i.test(text) && routineHead(statements, 'FORM', perform[1]) !== null;
  const fn = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text);
  if (fn) return routineHead(statements, 'FUNCTION', fn[1]) !== null;
  const method = /(?:->|=>)([A-Za-z0-9_]+)\s*\(|^CALL\s+METHOD\s+\S*?(?:->|=>)?([A-Za-z0-9_]+)(?:\s|$|\()/i.exec(text);
  if (method) return routineHead(statements, 'METHOD', method[1] ?? method[2]) !== null;
  return false;
}

/** Der Kopf einer Routine im gelieferten Code — `FORM name`, `METHOD name`, `FUNCTION name`. */
function routineHead(
  statements: readonly AbapStatement[],
  kind: 'FORM' | 'METHOD' | 'FUNCTION' | 'MODULE',
  name: string,
): AbapStatement | null {
  const wanted = name.toLowerCase();
  return (
    statements.find((other) => {
      if (other.keyword.toUpperCase() !== kind) return false;
      const match = /^\S+\s+([A-Za-z0-9_~/]+)/.exec(other.text);
      if (!match) return false;
      const found = match[1].toLowerCase();
      // `METHOD if_x~name` implementiert `name` einer Schnittstelle.
      return found === wanted || found.endsWith(`~${wanted}`);
    }) ?? null
  );
}

/**
 * Die Implementierung einer aufgerufenen Methode im gelieferten Code — oder
 * `null`, wenn sie dort nicht steht.
 *
 * Ein statischer Aufruf `klasse=>m( )` zählt nur, wenn `klasse` selbst im
 * Ausschnitt definiert ist: ein `cl_salv_table=>factory( )` ist nicht die
 * lokale Methode `factory`, die zufällig gleich heißt. `super->m( )` meint die
 * Oberklasse, also nicht die Redefinition, in der der Aufruf steht.
 */
function methodImplementation(statements: readonly AbapStatement[], owner: string, name: string): AbapStatement | null {
  const lower = owner.toLowerCase();
  if (lower === 'super') {
    const all = statements.filter((other) => other.keyword.toUpperCase() === 'METHOD' && new RegExp(`^METHOD\\s+(?:\\S+~)?${escapeForRegExp(name)}$`, 'i').test(other.text));
    return all.length > 1 ? all[0] : null;
  }
  const staticCall = statements.some((other) => other.text.toLowerCase().includes(`${lower}=>${name.toLowerCase()}`));
  if (staticCall && lower !== 'me') {
    const local = statements.some((other) => {
      const definition = /^CLASS\s+([A-Za-z0-9_/]+)\s+(?:DEFINITION|IMPLEMENTATION)\b/i.exec(other.text);
      return definition !== null && definition[1].toLowerCase() === lower;
    });
    if (!local) return null;
  }
  return routineHead(statements, 'METHOD', name);
}

/**
 * Was eine Routine im gelieferten Code tut, als kurze Satzteile — höchstens
 * drei, das Schreibende zuerst: „ruft BAL_DB_SAVE auf und schreibt mit COMMIT
 * WORK fest". Gelesen wird nur die Routine selbst, nicht, was sie aufruft.
 */
function routineEffects(statements: readonly AbapStatement[], head: AbapStatement): string[] {
  const closer = `END${head.keyword.toUpperCase()}`;
  const body: AbapStatement[] = [];
  for (let i = head.index + 1; i < statements.length && statements[i].keyword.toUpperCase() !== closer; i += 1) {
    body.push(statements[i]);
  }
  const tables = internalTables(statements);
  const writes: string[] = [];
  const commits: string[] = [];
  const functions: string[] = [];
  const reads: string[] = [];
  const others: string[] = [];
  const nameOf = (raw: string) => {
    const entity = tableTerm(raw);
    return entity ? entity.plural : raw.toUpperCase();
  };
  for (const statement of body) {
    const text = statement.text;
    const keyword = statement.keyword.toUpperCase();
    if (keyword === 'COMMIT' && /^COMMIT\s+WORK\b/i.test(text)) commits.push('schreibt mit COMMIT WORK fest');
    else if (/^CALL\s+FUNCTION\s+'BAPI_TRANSACTION_COMMIT'/i.test(text)) commits.push('schreibt mit BAPI_TRANSACTION_COMMIT fest');
    else if (/^CALL\s+FUNCTION\s+'([^']+)'/i.test(text)) {
      const fn = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)![1];
      functions.push(/\bIN\s+UPDATE\s+TASK\b/i.test(text) ? `${fn} (zur Verbuchung)` : fn);
    } else if (/^CALL\s+TRANSACTION\s+'([^']+)'/i.test(text)) {
      others.push(`ruft die Transaktion ${/^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(text)![1]} auf`);
    } else if (['UPDATE', 'INSERT', 'MODIFY', 'DELETE'].includes(keyword) && isDbWrite(statement, tables)) {
      const target = /^(?:UPDATE|MODIFY|INSERT\s+INTO|INSERT|DELETE\s+FROM|DELETE)\s+([A-Za-z0-9_/]+)/i.exec(text);
      if (target) {
        const verb =
          keyword === 'UPDATE' ? 'ändert' : keyword === 'INSERT' ? 'legt Sätze an in' : keyword === 'DELETE' ? 'löscht aus' : 'schreibt in';
        writes.push(`${verb} ${nameOf(target[1])}`);
      }
    } else if (keyword === 'SELECT') {
      const from = /\bFROM\s+([A-Za-z0-9_/]+)/i.exec(text);
      if (from) reads.push(nameOf(from[1]));
    } else if (keyword === 'MESSAGE' && !/\bINTO\b/i.test(text)) others.push('gibt eine Meldung aus');
    else if (isOutputWrite(statement)) others.push('gibt Listenzeilen aus');
    else if (keyword === 'RAISE' && /^RAISE\s+EVENT\s+([A-Za-z0-9_]+)/i.test(text)) {
      others.push(`löst das Ereignis ${/^RAISE\s+EVENT\s+([A-Za-z0-9_]+)/i.exec(text)![1]} aus`);
    }
  }
  const unique = (items: string[]) => items.filter((item, index) => items.indexOf(item) === index);
  const effects = [
    ...unique(writes),
    ...(functions.length > 0 ? [`ruft ${enumerate(unique(functions).slice(0, 3))} auf`] : []),
    ...unique(commits),
    ...(reads.length > 0 ? [`liest ${enumerate(unique(reads).slice(0, 3))}`] : []),
    ...unique(others),
  ];
  return effects.slice(0, 3);
}

/** Eine Anweisung, hinter der Code steht, der schreiben oder festschreiben kann. */
function callsOut(statement: AbapStatement): boolean {
  return /^(?:PERFORM|CALL|SUBMIT|COMMIT|RAISE\s+EVENT)\b/i.test(statement.text) || /->|=>/.test(statement.text);
}

/**
 * Die Verarbeitungseinheit, die ein RETURN verlässt, und wo sie endet: die
 * Routine bis zu ihrem END…, das Ereignis bis zum nächsten Ereignis oder zur
 * nächsten Routine.
 */
function processingUnit(
  statements: readonly AbapStatement[],
  stack: readonly Block[],
  index: number,
): { kind: 'routine' | 'event' | 'unknown'; start: number; end: number } {
  const routine = [...stack].reverse().find((block) => block.kind === 'routine');
  if (routine) {
    const closer = /^METHOD$/i.test(routine.head.keyword)
      ? 'ENDMETHOD'
      : /^FUNCTION$/i.test(routine.head.keyword)
        ? 'ENDFUNCTION'
        : /^MODULE$/i.test(routine.head.keyword)
          ? 'ENDMODULE'
          : 'ENDFORM';
    const end = statements.findIndex((other, i) => i > index && other.keyword.toUpperCase() === closer);
    return { kind: 'routine', start: routine.head.index, end: end < 0 ? statements.length : end };
  }
  let start = 0;
  let kind: 'event' | 'unknown' = 'unknown';
  for (let i = index - 1; i >= 0; i -= 1) {
    if (isEvent(statements[i])) {
      start = i;
      kind = 'event';
      break;
    }
  }
  const end = statements.findIndex(
    (other, i) => i > index && (isEvent(other) || /^(?:FORM|CLASS|METHOD|MODULE|FUNCTION)$/i.test(other.keyword)),
  );
  return { kind, start, end: end < 0 ? statements.length : end };
}

/**
 * Was ein Wächter mit seinem Rücksprung verhindert (F6).
 *
 * „Vor der Datenbankoperation zurückgekehrt" nur, wenn in derselben Einheit
 * hinter dem Rücksprung wirklich geschrieben wird. „Es wird nichts
 * geschrieben" nur, wenn der Weg es trägt: der Rücksprung verlässt ein
 * Ereignis (eine Routine kehrt zum Aufrufer zurück, und der macht weiter),
 * der Wächter selbst ruft nichts auf, vor ihm wurde in der Einheit nichts
 * geschrieben, und kein anderes Ereignis (END-OF-SELECTION …) schreibt oder
 * ruft etwas auf. Sonst wäre es eine Behauptung ohne Beleg — genau die, die
 * die Richter an einem `log_sichern` mit COMMIT WORK dahinter gefunden haben.
 */
function guardExit(
  statements: readonly AbapStatement[],
  index: number,
  body: readonly AbapStatement[],
  leave: AbapStatement,
  context: SourceContext,
): string {
  const keyword = leave.keyword.toUpperCase();
  const stack = context.stacks[leave.index];
  const innermost = [...stack].reverse().find((block) => block.kind === 'loop' || block.kind === 'routine');
  if (keyword === 'EXIT' && innermost?.kind === 'loop') return 'die Schleife verlassen';
  if (keyword === 'LEAVE') return leavePhrase(leave) ?? 'der Block verlassen';
  const unit = processingUnit(statements, stack, leave.index);
  const writesLater = statements.slice(leave.index + 1, unit.end).some((next) => isDbWrite(next, context.tables));
  if (!writesLater) return 'der Block verlassen';
  const quiet =
    unit.kind !== 'routine' &&
    !body.some((statement) => callsOut(statement) || isDbWrite(statement, context.tables)) &&
    !statements.slice(unit.start, index).some((statement) => isDbWrite(statement, context.tables) || /^COMMIT\b/i.test(statement.text)) &&
    !statements
      .slice(unit.end)
      .some(
        (statement) =>
          !context.stacks[statement.index].some((block) => block.kind === 'routine' || block.kind === 'class') &&
          !/^(?:FORM|CLASS|METHOD|MODULE|FUNCTION)$/i.test(statement.keyword) &&
          (callsOut(statement) || isDbWrite(statement, context.tables)),
      );
  return quiet
    ? 'vor der Datenbankoperation zurückgekehrt; es wird nichts geschrieben'
    : 'vor der Datenbankoperation zurückgekehrt';
}

/**
 * Wohin ein `LEAVE` führt, als Satzteil nach „wird" (F9).
 *
 * Früher hieß jedes LEAVE „die Screenfolge wird beendet" — auch `LEAVE TO
 * SCREEN 200` (weiter mit Bild 200), `LEAVE LIST-PROCESSING` (zurück aus der
 * Liste) und `LEAVE PROGRAM` (das ganze Programm endet).
 */
function leavePhrase(statement: AbapStatement): string | null {
  const text = statement.text.trim();
  const screen = /^LEAVE\s+TO\s+SCREEN\s+(\S+)$/i.exec(text);
  if (screen) return screen[1] === '0' ? 'die Screenfolge beendet' : `zu Bild ${plain(screen[1])} gewechselt`;
  if (/^LEAVE\s+SCREEN$/i.test(text)) return 'das aktuelle Bild verlassen';
  if (/^LEAVE\s+LIST-PROCESSING$/i.test(text)) return 'die Listenverarbeitung verlassen';
  if (/^LEAVE\s+TO\s+LIST-PROCESSING\b/i.test(text)) return 'in die Listenverarbeitung gewechselt';
  if (/^LEAVE\s+PROGRAM$/i.test(text)) return 'das Programm beendet';
  const transaction = /^LEAVE\s+TO\s+(?:CURRENT\s+)?TRANSACTION\s*('[^']*'|\S+)?/i.exec(text);
  if (transaction) {
    return transaction[1]
      ? `das Programm verlassen und die Transaktion ${literalOf(transaction[1]) ?? plain(transaction[1])} gestartet`
      : 'das Programm verlassen und die aktuelle Transaktion neu gestartet';
  }
  return null;
}

/** Der ganze Satz zu einem `LEAVE`. */
function leaveSentence(statement: AbapStatement, statements: readonly AbapStatement[]): string {
  const text = statement.text.trim();
  if (/^LEAVE\s+TO\s+SCREEN\s+0$/i.test(text)) return 'Die Screenfolge wird beendet.';
  const screen = /^LEAVE\s+TO\s+SCREEN\s+(\S+)$/i.exec(text);
  if (screen) return `Es geht weiter mit Bild ${plain(screen[1])}.`;
  if (/^LEAVE\s+SCREEN$/i.test(text)) {
    const set = statements
      .slice(Math.max(0, statement.index - 2), statement.index)
      .map((other) => /^SET\s+SCREEN\s+(\S+)$/i.exec(other.text))
      .find(Boolean);
    if (set && set[1] === '0') return 'Die Screenfolge wird beendet.';
    return set ? `Es geht weiter mit Bild ${plain(set[1])}.` : 'Das aktuelle Bild wird verlassen; es folgt das eingestellte Folgebild.';
  }
  if (/^LEAVE\s+LIST-PROCESSING$/i.test(text)) {
    return 'Die Listenverarbeitung wird verlassen; es geht zurück zu dem Bild, von dem sie ausging.';
  }
  if (/^LEAVE\s+TO\s+LIST-PROCESSING\b/i.test(text)) return 'Es wird in die Listenverarbeitung gewechselt.';
  if (/^LEAVE\s+PROGRAM$/i.test(text)) return 'Das Programm wird beendet.';
  const transaction = /^LEAVE\s+TO\s+(?:CURRENT\s+)?TRANSACTION\s*('[^']*'|\S+)?/i.exec(text);
  if (transaction) {
    return transaction[1]
      ? `Das Programm wird verlassen und die Transaktion ${literalOf(transaction[1]) ?? plain(transaction[1])} gestartet.`
      : 'Das Programm wird verlassen und die aktuelle Transaktion neu gestartet.';
  }
  return 'Die aktuelle Verarbeitung wird verlassen.';
}

/** Eine Zuweisung in einem Zweig: „Negative Beträge setzen die Route auf INVALID." */
function branchAssignment(statement: AbapStatement, stack: Block[]): Draft | null {
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(statement.text);
  if (!assign) return null;
  const branch = [...stack].reverse().find((block) => block.kind === 'if' || block.kind === 'elseif' || block.kind === 'else');
  if (!branch) return null;
  const value = literalOf(assign[2]) ?? assign[2];
  const target = termFor(assign[1]);
  const subject = branch.kind === 'else' ? elseSubject(branch.previous) : conditionSubject(branch.head.text).subject;
  // Ein `rv_`/`cv_`/`ev_` ist das Ergebnis der Routine selbst: der Fall
  // *erhält* diesen Wert. Eine gewöhnliche Variable wird dagegen *gesetzt*.
  const returning = /^(rv_|cv_|ev_)/i.test(assign[1].trim());
  return {
    anchors: [range(statement), range(branch.head)],
    core: returning
      ? `${subject} erhalten ${value}.`
      : `${subject} setzen die ${target.singular} auf ${value}.`,
    grain: 'group',
    tag: 'branch',
  };
}

/** Eine Zuweisung ohne Zweig: „Die Review-Markierung wird auf N gesetzt." */
function plainAssignment(statement: AbapStatement): Draft | null {
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(statement.text);
  if (!assign) return null;
  const value = literalOf(assign[2]) ?? assign[2];
  return {
    anchors: [range(statement)],
    core: `Die ${termFor(plain(assign[1])).singular} wird auf ${value} gesetzt.`,
    tag: 'set',
  };
}

/**
 * Was aus einer Registrierung wird — roadmap 2.12, als Vorbehalt am Satz.
 * Angestoßen, verworfen oder beim Programmende nicht ausgeführt, jeweils mit
 * der Zeile, die es trägt; was offen bleibt, wird gesagt.
 */
function registrationNotes(luw: LuwModel, index: number): string[] {
  const registration = luw.registrations.find((r) => r.statementIndex === index);
  const notes = ['An der Aufrufstelle wird nichts geändert.'];
  if (!registration) return notes;
  const lines = (state: 'dispatched' | 'discarded') =>
    registration.outcomes.filter((o) => o.state === state).map((o) => o.lineStart).join(' bzw. ');
  const dispatched = lines('dispatched');
  const discarded = lines('discarded');
  if (dispatched) notes.push(`Angestoßen wird er erst mit dem COMMIT WORK in Zeile ${dispatched}.`);
  if (discarded) notes.push(`Mit dem ROLLBACK WORK in Zeile ${discarded} wird die Registrierung verworfen.`);
  if (registration.unresolved?.state === 'orphaned') {
    notes.push(dispatched
      ? 'Auf dem Weg ohne COMMIT WORK wird er nicht angestoßen und nicht ausgeführt.'
      : 'Im gelieferten Programm folgt kein COMMIT WORK: er wird nicht angestoßen und nicht ausgeführt.');
  } else if (registration.unresolved) {
    notes.push('Ob ein COMMIT WORK ihn auf jedem Weg anstößt, ist im gelieferten Code nicht bestimmt.');
  }
  return notes;
}

// ---------------------------------------------------------------------------
// MESSAGE (F5)
// ---------------------------------------------------------------------------

const MESSAGE_TYPES: Record<string, { noun: string; article: string }> = {
  A: { noun: 'Abbruchmeldung', article: 'eine' },
  E: { noun: 'Fehlermeldung', article: 'eine' },
  W: { noun: 'Warnung', article: 'eine' },
  I: { noun: 'Informationsmeldung', article: 'eine' },
  S: { noun: 'Statusmeldung', article: 'eine' },
  X: { noun: 'Meldung vom Typ X', article: 'eine' },
};

interface MessageParts {
  /** `001(ZSD)`, `„Text"` oder der Name der Variablen. */
  label: string | null;
  type: string | null;
  into: string | null;
  raising: string | null;
  displayLike: string | null;
}

/** Die Bestandteile einer `MESSAGE`-Anweisung — Nummer, Typ, INTO, RAISING, DISPLAY LIKE. */
function messageParts(text: string): MessageParts {
  const body = text.replace(/^MESSAGE\s+/i, '');
  const short = /^([AEISWX])(\d{3})(?:\((\S+?)\))?(?=\s|$)/i.exec(body);
  const byId = /^ID\s+('[^']*'|\S+)\s+TYPE\s+('[^']*'|\S+)\s+NUMBER\s+('[^']*'|\S+)/i.exec(body);
  const typeAddition = /\bTYPE\s+('[^']*'|\S+)/i.exec(body);
  let label: string | null = null;
  let type: string | null = null;
  if (short) {
    type = short[1].toUpperCase();
    label = `${short[2]}${short[3] ? `(${short[3].toUpperCase()})` : ''}`;
  } else if (byId) {
    type = (literalOf(byId[2]) ?? '').toUpperCase() || null;
    // Nummer und Klasse aus Variablen sind erst zur Laufzeit bekannt — dann
    // bleibt die Meldung ohne Nummer, statt Feldnamen als Nummer zu zeigen.
    const number = literalOf(byId[3]);
    const id = literalOf(byId[1]);
    label = number != null && id != null ? `${number}(${id.toUpperCase()})` : null;
  } else {
    const first = /^('[^']*'|`[^`]*`|\S+)/.exec(body)?.[1] ?? '';
    const literal = literalOf(first.replace(/\(\w{1,3}\)$/, ''));
    label = literal != null ? `„${literal}“` : plain(first);
    if (typeAddition) type = (literalOf(typeAddition[1]) ?? '').toUpperCase() || null;
  }
  const into = /\bINTO\s+(\S+)/i.exec(body);
  const raising = /\bRAISING\s+(\S+)/i.exec(body);
  const like = /\bDISPLAY\s+LIKE\s+('[^']*'|\S+)/i.exec(body);
  return {
    label,
    type,
    into: into ? plain(into[1]) : null,
    raising: raising ? plain(raising[1]) : null,
    displayLike: like ? (literalOf(like[1]) ?? '').toUpperCase() || null : null,
  };
}

/**
 * Der Satz zu `MESSAGE` (F5).
 *
 * `MESSAGE … INTO v` gibt **nichts** aus — der Meldungstext landet in `v`.
 * `MESSAGE … RAISING x` löst eine Ausnahme aus; angezeigt wird nur, wenn der
 * Aufrufer sie nicht behandelt. Nur die übrigen Formen zeigen etwas an, und
 * dann mit ihrem Typ.
 */
function messageSentence(text: string): string {
  const parts = messageParts(text);
  const label = parts.label ? ` ${parts.label}` : '';
  if (parts.into) {
    return `Der Meldungstext${label} wird in ${parts.into} übernommen; angezeigt wird dabei nichts.`;
  }
  const kind = parts.type ? MESSAGE_TYPES[parts.type] : undefined;
  if (parts.raising) {
    return `Die Ausnahme ${parts.raising} wird ausgelöst; die Meldung${label} erscheint nur, wenn der Aufrufer die Ausnahme nicht behandelt.`;
  }
  const noun = kind ? kind.noun : 'Meldung';
  const like = parts.displayLike && MESSAGE_TYPES[parts.displayLike] && parts.displayLike !== parts.type
    ? `, angezeigt wie ${MESSAGE_TYPES[parts.displayLike].article} ${MESSAGE_TYPES[parts.displayLike].noun}`
    : '';
  const consequence =
    parts.type === 'A'
      ? '; das Programm wird abgebrochen'
      : parts.type === 'X'
        ? '; das Programm bricht mit einem Laufzeitfehler ab'
        : '';
  return `Die ${noun}${label} wird ausgegeben${like}${consequence}.`;
}

/** Derselbe Inhalt als Satzteil für Zweige und Folgen. */
function messageFragment(text: string): string {
  const parts = messageParts(text);
  if (parts.into) return `der Meldungstext in ${parts.into} übernommen`;
  if (parts.raising) return `die Ausnahme ${parts.raising} ausgelöst`;
  const kind = parts.type ? MESSAGE_TYPES[parts.type] : undefined;
  return kind ? `${kind.article} ${kind.noun} ausgegeben` : 'eine Meldung ausgegeben';
}

/** Was übersprungen wird, wenn ein CHECK mit diesem Vergleich in einer Schleife steht. */
const CHECK_COMPLEMENT: Record<string, string> = {
  '>=': 'kleinere',
  GE: 'kleinere',
  '>': 'kleinere und gleiche',
  GT: 'kleinere und gleiche',
  '<=': 'größere',
  LE: 'größere',
  '<': 'größere und gleiche',
  LT: 'größere und gleiche',
};

/**
 * Der Satz zu einem `CHECK` (F1) — die Folge hängt am Ort, nicht an einer Vorlage.
 *
 * `CHECK` verlässt in einer Schleife den **Durchlauf**, in einer Routine die
 * **Routine**, sonst den **Ereignisblock**. Die frühere Vorlage sagte überall
 * „kleinere werden übersprungen, die Schleife läuft weiter" — auch ohne
 * Schleife und auch bei einer Gleichheitsprüfung, wo es kein „kleiner" gibt.
 * „Kleinere" steht jetzt nur noch dort, wo es wahr ist: ein Größenvergleich
 * über ein bekanntes Fachwort in einer Schleife.
 */
function checkSentence(
  statement: AbapStatement,
  statements: readonly AbapStatement[],
  stack: readonly Block[],
  subrc?: (value: string, equal: boolean) => string | null,
): string {
  const unit = enclosingUnit(statements, stack, statement.index);
  const condition = statement.text.replace(/^CHECK\s+/i, '').trim();
  const compare = /^(\S+)\s*(<=|>=|<|>|\bGE\b|\bGT\b|\bLE\b|\bLT\b)\s*(\S+)$/i.exec(condition);
  if (unit.kind === 'loop' && compare && isKnownField(compare[1])) {
    const { subject } = conditionSubject(`CHECK ${compare[1]} ${normalizeOperator(compare[2])} ${compare[3]}`);
    const complement = CHECK_COMPLEMENT[compare[2].toUpperCase()];
    return `Nur ${subject} gehen weiter; ${complement} werden übersprungen, die Schleife läuft weiter.`;
  }
  const clause = conditionClause(condition, subrc);
  if (unit.kind === 'loop') {
    return `Nur wenn ${clause}, wird der Schleifendurchlauf fortgesetzt; sonst wird er übersprungen, und die Schleife läuft mit dem nächsten Durchlauf weiter.`;
  }
  return `Nur wenn ${clause}, geht es weiter; sonst wird ${unitLabel(unit)} an dieser Stelle verlassen.`;
}

function normalizeOperator(operator: string): string {
  return ({ GE: '>=', GT: '>', LE: '<=', LT: '<', EQ: '=', NE: '<>' } as Record<string, string>)[operator.toUpperCase()] ?? operator;
}

/** Die Sätze, die aus einer einzelnen Anweisung kommen. */
function sentenceFor(
  statement: AbapStatement,
  statements: readonly AbapStatement[],
  stack: Block[],
  origins: Map<string, ValueOrigin>,
  luw: LuwModel,
): Draft | null {
  const text = statement.text;
  const keyword = statement.keyword.toUpperCase();
  const anchors = [range(statement)];

  if (keyword === 'WRITE') {
    const formatted = writeToSentence(statement);
    if (formatted) return { anchors, core: formatted, tag: 'write' };
    const written = writeBody(statement);
    const resolvedText = literalOf(written) == null ? resolveValue(written, statements, statement.index) : null;
    if (resolvedText && resolvedText.value) {
      // Schritt 1 vor Schritt 2: der Leser sieht den Text, nicht den Variablennamen.
      return { anchors, core: `Der Text ${resolvedText.value} wird ausgegeben.`, tag: 'write' };
    }
    const { label, literal } = writtenTarget(statement, origins);
    // Ein ausgegebenes Literal ist **kein** Erfolgsnachweis: es belegt, dass
    // diese Stelle erreicht wurde, und nichts sonst. Das steht als Vorbehalt
    // am Satz, weil es aus dem Code folgt und nicht aus Vorsicht.
    const notes = literal ? ['Die Ausgabe belegt nur das Erreichen dieser Stelle im Code.'] : [];
    return { anchors, core: `${label} wird ausgegeben.`, notes, tag: 'write' };
  }

  if (keyword === 'SELECT') return selectSentence(statement, statements);

  // **Angekündigt oder persistiert?** Eine Datenbankänderung ohne COMMIT im
  // gelieferten Code ist angekündigt und nicht persistiert; steht hinter ihr
  // kein `sy-subrc`-Vergleich, ist auch der Erfolg nicht geprüft. Beides ist
  // aus dem Ausschnitt ablesbar und gehört deshalb an den Satz.
  //
  // F6: „kein COMMIT WORK" ist eine negative Behauptung und steht nur da, wo
  // sie trägt. Ein `BAPI_TRANSACTION_COMMIT` schreibt fest wie ein COMMIT
  // WORK; ein Aufruf, dessen Inneres nicht im Ausschnitt steht, kann es tun;
  // und außerhalb eines ausführbaren Programms (Methode, Baustein, Exit)
  // gehört das Festschreiben dem Aufrufer. In all diesen Fällen schweigt der
  // Satz dazu, statt etwas zu behaupten, was der Code nicht zeigt.
  const persistenceNotes = (): string[] => {
    const notes: string[] = [];
    const rest = statements.slice(statement.index + 1);
    const rap = /^MODIFY\s+ENTITIES\b/i.test(text);
    const committed = statements.some((other) =>
      rap
        ? /^COMMIT\s+ENTITIES\b/i.test(other.text)
        : /^COMMIT\b/i.test(other.text) || /\bBAPI_TRANSACTION_COMMIT\b|\bDB_COMMIT\b/i.test(other.text),
    );
    const program = statements.some((other) => /^(?:REPORT|PROGRAM)$/i.test(other.keyword));
    const opaque = rest.some((other) => callsOut(other) && !definedInSource(other, statements));
    if (rap && !committed) {
      notes.push('Angekündigt, nicht persistiert: die Änderung liegt im Transaktionspuffer; im gelieferten Code steht kein COMMIT ENTITIES.');
    } else if (!rap && !committed && program && !opaque) {
      notes.push('Im gelieferten Code steht kein COMMIT WORK.');
    }
    if (!rest.some((other) => /\bsy-subrc\b/i.test(other.text))) {
      notes.push('sy-subrc wird danach nicht ausgewertet.');
    }
    return notes;
  };

  if (keyword === 'UPDATE') {
    const target = /^UPDATE\s+(\([^)]+\)|[A-Za-z0-9_/]+)/i.exec(text);
    const raw = target ? plain(target[1]) : null;
    const entity = raw ? tableTerm(raw) : null;
    const set = /\bSET\s+(\S+)\s*=/i.exec(text);
    const field = set ? termFor(set[1]).singular : null;
    const keyed = /\bWHERE\s+\S+\s*=\s*@?[ps]_/i.test(text);
    const core = field
      ? `Die ${field} ${entity ? `des ${keyed ? 'angegebenen ' : ''}${entity.genitive}` : `in ${raw}`} wird geändert.`
      : `Eine Zeile ${entity ? `der ${entity.plural}` : `in ${raw}`} wird geändert.`;
    return {
      anchors,
      core,
      notes: ['Ob eine Zeile getroffen wird, garantiert der Code nicht.', ...persistenceNotes()],
      tag: 'update',
    };
  }

  if (keyword === 'MODIFY' && /^MODIFY\s+SCREEN\b/i.test(text)) {
    return { anchors, core: 'Die geänderten Attribute des Bildelements werden übernommen.', tag: 'modify' };
  }
  if (keyword === 'MODIFY' && writesInternally(statement, internalTables(statements))) {
    const target = /^MODIFY\s+(?:TABLE\s+)?([A-Za-z0-9_\-<>~]+)/i.exec(text);
    return {
      anchors,
      core: `Eine Zeile der internen Tabelle ${target ? plain(target[1]) : ''} wird geändert; in die Datenbank wird dabei nichts geschrieben.`.replace(/\s+;/, ';'),
      tag: 'modify',
    };
  }
  if (keyword === 'MODIFY') {
    const target = /^MODIFY\s+(?:ENTITIES\s+OF\s+)?(\([^)]+\)|[A-Za-z0-9_/]+)/i.exec(text);
    const raw = target ? plain(target[1]) : null;
    const entity = raw ? tableTerm(raw) : null;
    return {
      anchors,
      core: `Eine Zeile ${entity ? `der ${entity.plural}` : `in ${raw}`} wird eingefügt oder überschrieben.`,
      notes: persistenceNotes(),
      tag: 'modify',
    };
  }

  // Roadmap 2.12: vor einem COMMIT WORK registrierte Verbuchungsbausteine
  // werden damit **angestoßen**, nicht als ausgeführt belegt (CC-026, CR-06).
  // Ohne Registrierung bleibt der bisherige Satz über die direkte Änderung.
  const event = luw.events.find((e) => e.statementIndex === statement.index);
  if (keyword === 'COMMIT') {
    if (event && event.registrations.length > 0) {
      const notes = event.andWait
        ? (event.subrcRead ? [] : ['Mit AND WAIT wird auf die Verbuchung gewartet; sy-subrc wird danach aber nicht ausgewertet.'])
        : ['Ohne AND WAIT wartet der Code das Verbuchungsergebnis nicht ab; ausgeführt oder persistiert ist damit nicht belegt.'];
      return {
        anchors,
        core: 'Mit COMMIT WORK wird die Verbuchung der zuvor registrierten Bausteine angestoßen.',
        notes,
        tag: 'commit',
      };
    }
    return { anchors, core: 'Mit COMMIT WORK wird die Änderung persistiert.', tag: 'commit' };
  }
  if (keyword === 'ROLLBACK') {
    if (event && event.registrations.length > 0) {
      return {
        anchors,
        core: 'Mit ROLLBACK WORK werden die zuvor registrierten Verbuchungen verworfen; der Baustein wird auf diesem Weg nicht ausgeführt.',
        tag: 'rollback',
      };
    }
    return { anchors, core: 'Mit ROLLBACK WORK werden die noch nicht festgeschriebenen Änderungen verworfen.', tag: 'rollback' };
  }

  if (keyword === 'PERFORM') {
    const name = /^PERFORM\s+(\([^)]+\)|[A-Za-z0-9_]+)/i.exec(text);
    const external = /\bIN\s+PROGRAM\b/i.test(text);
    // F7: steht die FORM im gelieferten Code, ist ihre Wirkung belegt — und
    // wird genannt, soweit sie sich ablesen lässt, statt „nicht belegt".
    const head = name && !external && !/^\(/.test(name[1]) ? routineHead(statements, 'FORM', name[1]) : null;
    const effects = head ? routineEffects(statements, head) : [];
    return {
      anchors,
      core: `Das ${external ? 'externe ' : ''}Unterprogramm ${name ? plain(name[1]) : ''} wird aufgerufen${effects.length > 0 ? `; es ${enumerate(effects)}` : ''}.`.replace(/\s+/g, ' '),
      notes: head ? [] : ['Seine Wirkung ist im gelieferten Code nicht belegt.'],
      tag: 'perform',
    };
  }

  if (keyword === 'SUBMIT') {
    const name = /^SUBMIT\s+([A-Za-z0-9_/]+)/i.exec(text);
    return {
      anchors,
      core: `Das Kindprogramm ${name ? name[1] : ''} wird gestartet.`.replace(/\s+/g, ' '),
      notes: ['Was das Kind tut, ist nicht Teil dieses Satzes.'],
      tag: 'submit',
    };
  }

  if (keyword === 'INCLUDE') {
    const name = /^INCLUDE\s+([A-Za-z0-9_/]+)/i.exec(text);
    return {
      anchors,
      core: `Der Report benötigt das Include ${name ? name[1] : ''}.`.replace(/\s+/g, ' '),
      notes: ['Es ist im gelieferten Ausschnitt nicht enthalten.'],
      tag: 'include',
    };
  }

  if (keyword === 'AUTHORITY-CHECK') {
    const object = /OBJECT\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    const name = object ? (literalOf(object[1]) ?? object[1]) : '';
    return { anchors, core: `Die Berechtigung auf ${name} wird geprüft.`, tag: 'auth' };
  }

  if (keyword === 'MESSAGE') {
    return { anchors, core: messageSentence(text), tag: 'message' };
  }

  if (keyword === 'CHECK') {
    return {
      anchors,
      core: checkSentence(statement, statements, stack, subrcClauseAt(statements, statement.index)),
      tag: 'check',
    };
  }

  if (keyword === 'ASSERT') {
    return {
      anchors,
      core: 'Ist die Zusicherung verletzt, bricht der Lauf mit einem Laufzeitfehler ab (ASSERTION_FAILED).',
      tag: 'assert',
    };
  }

  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) {
      const resolved = resolveValue(fn[1], statements, statement.index);
      const name = resolved.value ?? plain(fn[1]);
      const notes: string[] = [];
      let core = `Der Funktionsbaustein ${name} wird aufgerufen.`;
      if (resolved.from === 'constant') {
        core = `Das Aufrufziel ist die unveränderliche Konstante ${name}.`;
      } else if (resolved.from === 'assignment') {
        core = `Es wird genau der zuvor in Zeile ${resolved.line} zugewiesene Funktionsbaustein ${name} aufgerufen.`;
      } else if (resolved.from === 'unresolved') {
        notes.push('Welcher Baustein das ist, entscheidet die Eingabe zur Laufzeit.');
      }
      if (/\bIN\s+UPDATE\s+TASK\b/i.test(text)) {
        core = `Der Baustein ${name} wird zur Verbuchung registriert.`;
        notes.push(...registrationNotes(luw, statement.index));
      } else if (/\bSTARTING\s+NEW\s+TASK\b/i.test(text)) {
        core = `Der Baustein ${name} wird asynchron in einer eigenen Task gestartet.`;
        notes.push('Ein Ergebnis liegt zu diesem Zeitpunkt nicht vor.');
      } else if (/\bDESTINATION\b/i.test(text)) {
        // F10: „benachrichtigt" und „eingegebene" standen fest im Satz. Was
        // der Code trägt: der Baustein läuft in einem entfernten System, über
        // die Destination, die hier steht.
        const destination = /\bDESTINATION\s+('[^']*'|\S+)/i.exec(text);
        const where = !destination
          ? 'eine Destination'
          : literalOf(destination[1]) != null
            ? `die Destination ${literalOf(destination[1])}`
            : fromSelectionScreen(destination[1])
              ? 'die eingegebene Destination'
              : `die Destination aus ${plain(destination[1])}`;
        core = `${name} wird in einem entfernten System über ${where} aufgerufen.`;
        notes.push('Welches System und was dort geschieht, ist aus dem gelieferten Code nicht ableitbar.');
      }
      // Was hineingeht und was herauskommt — das ist die fachliche Aussage
      // eines Bausteinaufrufs, nicht sein Name allein.
      const exporting = [...text.matchAll(/\bEXPORTING\s+\w+\s*=\s*(\S+)/gi)].map((m) => plain(m[1]));
      const importing = [...text.matchAll(/\bIMPORTING\s+\w+\s*=\s*(\S+)/gi)].map((m) => plain(m[1]));
      if (
        resolved.from !== 'constant' &&
        exporting.length > 0 &&
        importing.length > 0 &&
        !/\bIN\s+UPDATE\s+TASK\b|\bSTARTING\s+NEW\s+TASK\b|\bDESTINATION\b/i.test(text)
      ) {
        core = `Der Code übergibt ${exporting[0]} an ${name} und übernimmt dessen Ausgabe nach ${importing[0]}.`;
      }
      return { anchors, core, notes, tag: 'call' };
    }
    const method = /^CALL\s+METHOD\s+(\S+)/i.exec(text);
    if (method) {
      const called = /^(?:(.*?)(?:->|=>))?([A-Za-z0-9_]+)$/.exec(method[1]);
      if (!called) {
        // `CALL METHOD (lv_name)` oder `obj->(lv_name)`: der Name steht erst zur Laufzeit fest.
        const receiving = /\b(?:RECEIVING|IMPORTING)\s+\w+\s*=\s*(\S+)/i.exec(text);
        return {
          anchors,
          core: receiving
            ? `Das Ergebnis der zur Laufzeit gewählten Methode wird in ${plain(receiving[1])} übernommen.`
            : 'Die zur Laufzeit gewählte Methode wird aufgerufen.',
          tag: 'call',
        };
      }
      const owner = called[1] ?? '';
      const head = methodImplementation(statements, owner, called[2]);
      const effects = head ? routineEffects(statements, head) : [];
      return {
        anchors,
        core: `Die Methode ${called[2]}${owner ? ` von ${owner}` : ''} wird aufgerufen${effects.length > 0 ? `; sie ${enumerate(effects)}` : ''}.`,
        notes: head ? [] : ['Ihr fachliches Verhalten ist im gelieferten Code nicht belegt.'],
        tag: 'call',
      };
    }
    const transaction = /^CALL\s+TRANSACTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (transaction) {
      // F4: der Satz sagt, **dass** die Transaktion aufgerufen wird und wie —
      // nicht, wozu. „Anlage" aus dem Namen zu lesen hieß bei VA02, ME53N
      // oder PA20 schlicht das Falsche.
      const name = literalOf(transaction[1]) ?? transaction[1];
      const using = /\bUSING\s+(\S+)/i.exec(text);
      const mode = /\bMODE\s+('[^']*'|\S+)/i.exec(text);
      const update = /\bUPDATE\s+('[^']*'|\S+)/i.exec(text);
      const modeValue = mode ? (literalOf(mode[1]) ?? plain(mode[1])) : null;
      const how = [
        using ? 'per Batch-Input' : '',
        modeValue ? (/^[AENP]$/i.test(modeValue) ? `im Modus ${modeValue.toUpperCase()}` : `im Modus aus ${modeValue}`) : '',
      ].filter(Boolean);
      const updateValue = update ? (literalOf(update[1]) ?? plain(update[1])).toUpperCase() : null;
      const booking =
        updateValue === 'S'
          ? ' und synchron verbucht'
          : updateValue === 'A'
            ? ' und asynchron verbucht'
            : updateValue === 'L'
              ? ' und lokal verbucht'
              : '';
      const after: string[] = [];
      if (/\bAND\s+SKIP\s+FIRST\s+SCREEN\b/i.test(text)) after.push('das Einstiegsbild wird übersprungen');
      // Mit Bilddaten stößt der Aufruf die Verarbeitung der Transaktion an;
      // ohne ist es ein Dialogaufruf. Beides sagt nichts über ihren Zweck.
      return {
        anchors,
        core: `Die Transaktion ${name} wird ${how.length > 0 ? `${how.join(' ')} ` : ''}${using ? 'angestoßen' : 'aufgerufen'}${booking}${after.length > 0 ? `; ${after.join(', ')}` : ''}.`,
        notes: using ? ['Ob und was persistiert wird, entscheidet die aufgerufene Transaktion.'] : [],
        tag: 'call',
      };
    }
    const screen = /^CALL\s+SCREEN\s+(\d+)/i.exec(text);
    if (screen) {
      return { anchors, core: `Das Programm ruft eine Screenfolge ab ${screen[1]} auf.`, tag: 'call' };
    }
    const badi = /^CALL\s+BADI\s+(\S+)/i.exec(text);
    if (badi) {
      // F10: was hineingeht und herauskommt, steht in EXPORTING und
      // CHANGING/IMPORTING/RECEIVING — nicht in einem festen Satz über
      // „Betrag" und „Routentext", der nur für einen einzigen Fall stimmte.
      const name = badi[1].split('->')[1] ?? badi[1];
      const given = [...text.matchAll(/\bEXPORTING\s+(.+?)(?=\s+(?:IMPORTING|CHANGING|RECEIVING|EXCEPTIONS)\b|$)/gi)]
        .flatMap((match) => [...match[1].matchAll(/\w+\s*=\s*(\S+)/g)].map((pair) => pair[1]));
      const taken = [...text.matchAll(/\b(?:IMPORTING|CHANGING|RECEIVING)\s+(.+?)(?=\s+(?:EXPORTING|IMPORTING|CHANGING|RECEIVING|EXCEPTIONS)\b|$)/gi)]
        .flatMap((match) => [...match[1].matchAll(/\w+\s*=\s*(\S+)/g)].map((pair) => pair[1]));
      const capital = (phrase: string) => phrase.charAt(0).toUpperCase() + phrase.slice(1);
      const back = taken.length > 0 ? enumerate(taken.map((value) => nounPhrase(value, 'akk'))) : null;
      const core =
        given.length > 0
          ? `${capital(enumerate(given.map((value) => nounPhrase(value, 'nom'))))} ${given.length > 1 ? 'werden' : 'wird'} der BAdI-Methode ${name} übergeben${back ? ` und ${back} übernommen` : ''}.`
          : `Die BAdI-Methode ${name} wird aufgerufen${back ? `; übernommen wird ${back}` : ''}.`;
      return { anchors, core, tag: 'call' };
    }
    const kernel = /^CALL\s+'([^']+)'/i.exec(text);
    if (kernel) {
      return {
        anchors,
        core: `Der Kernelaufruf ${kernel[1]} wird ausgeführt.`,
        notes: ['Der tatsächliche Rückgabewert ist nicht im Quelltext bekannt.'],
        tag: 'call',
      };
    }
  }

  if (keyword === 'GET') {
    if (/^GET\s+BADI\b/i.test(text)) {
      return { anchors, core: 'Die konfigurierte BAdI-Implementierung wird angefordert.', tag: 'get' };
    }
    // Nur `GET knoten` ist das Ereignis einer logischen Datenbank (F3). Alles
    // andere mit GET liest einen Wert aus der Laufzeitumgebung.
    const parameter = /^GET\s+PARAMETER\s+ID\s+('[^']*'|\S+)\s+FIELD\s+(\S+)/i.exec(text);
    if (parameter) {
      return {
        anchors,
        core: `Der Benutzerparameter ${literalOf(parameter[1]) ?? parameter[1]} wird in ${plain(parameter[2])} übernommen.`,
        tag: 'get',
      };
    }
    const stamp = /^GET\s+TIME\s+STAMP\s+FIELD\s+(\S+)/i.exec(text);
    if (stamp) return { anchors, core: `Der aktuelle Zeitstempel wird in ${plain(stamp[1])} übernommen.`, tag: 'get' };
    if (/^GET\s+TIME\b/i.test(text)) {
      const field = /\bFIELD\s+(\S+)/i.exec(text);
      return {
        anchors,
        core: field
          ? `Die aktuelle Uhrzeit wird in ${plain(field[1])} übernommen.`
          : 'Datum und Uhrzeit des Laufs (sy-datum, sy-uzeit) werden aktualisiert.',
        tag: 'get',
      };
    }
    const reference = /^GET\s+REFERENCE\s+OF\s+(\S+)\s+INTO\s+(\S+)/i.exec(text);
    if (reference) {
      return { anchors, core: `Eine Referenz auf ${plain(reference[1])} wird in ${plain(reference[2])} abgelegt.`, tag: 'get' };
    }
    if (/^GET\s+CURSOR\b/i.test(text)) {
      return { anchors, core: 'Die Cursorposition auf dem Bild oder in der Liste wird gelesen.', tag: 'get' };
    }
    if (!isLdbGet(text)) return null;
    const ldb = /^GET\s+([A-Za-z0-9_]+)/i.exec(text);
    const entity = ldb ? tableTerm(ldb[1]) : null;
    return {
      anchors,
      core: `Jeder von der logischen Datenbank gelieferte ${entity ? entity.singular : (ldb?.[1] ?? '')}-Satz wird verarbeitet.`,
      notes: ['Welche Sätze das sind, bestimmt die logische Datenbank mit ihrem Selektionsbild, nicht der Report.'],
      tag: 'get',
    };
  }

  if (keyword === 'SET' && /^SET\s+PF-STATUS\b/i.test(text)) {
    const status = /PF-STATUS\s+('[^']*'|\S+)/i.exec(text);
    return { anchors, core: `Der GUI-Status ${status ? (literalOf(status[1]) ?? status[1]) : ''} wird gesetzt.`, tag: 'status' };
  }

  if (keyword === 'LEAVE') {
    return { anchors, core: leaveSentence(statement, statements), tag: 'leave' };
  }

  if (keyword === 'CREATE' && /^CREATE\s+DATA\b/i.test(text)) {
    return {
      anchors,
      core: 'Ein Datenobjekt des zur Laufzeit benannten Typs wird angelegt.',
      notes: ['Es werden dabei keine Datenbankzeilen geladen.'],
      tag: 'create',
    };
  }

  if (keyword === 'ASSIGN') {
    if (/\bCOMPONENT\b/i.test(text)) {
      return { anchors, core: 'Eine Komponente der Struktur wird an das Feldsymbol gebunden.', tag: 'assign' };
    }
    return {
      anchors,
      core: 'Ein Feld aus dem Programmspeicher eines anderen Programms wird gebunden.',
      notes: ['Ob es dort existiert, entscheidet der Aufrufkontext zur Laufzeit.'],
      tag: 'assign',
    };
  }

  if (keyword === 'EXEC') {
    return {
      anchors,
      core: 'Ein Native-SQL-Block wird ausgeführt.',
      notes: ['Native SQL hat keinen automatischen Mandantenfilter.'],
      tag: 'exec',
    };
  }

  if (keyword === 'APPEND') {
    const target = /\bTO\s+(\S+)$/i.exec(text);
    return {
      anchors,
      core: `Eine Zeile wird ${target ? `in ${plain(target[1])} ` : ''}aufgenommen.`,
      tag: 'append',
    };
  }

  if (keyword === 'CLASS' && /\bINHERITING\s+FROM\b/i.test(text)) {
    const base = /\bINHERITING\s+FROM\s+([A-Za-z0-9_/]+)/i.exec(text);
    const known = base
      ? statements.some((other) => {
          const definition = /^CLASS\s+([A-Za-z0-9_/]+)\s+DEFINITION\b/i.exec(other.text);
          return definition !== null && definition[1].toLowerCase() === base[1].toLowerCase() && !/\bDEFERRED\b/i.test(other.text);
        })
      : false;
    return {
      anchors,
      core: `Die lokale Kindklasse erbt von der Klasse ${base ? base[1] : ''}.`.replace(/\s+/g, ' '),
      notes: known ? [] : ['Diese Basisklasse ist im gelieferten Code nicht enthalten.'],
      tag: 'class',
    };
  }

  if (keyword === 'TYPES' && /\bBEGIN\s+OF\b/i.test(text)) {
    // Die Bestandteile stehen in den Folgegliedern derselben Kette.
    const fields: string[] = [];
    for (let i = statement.index + 1; i < statements.length; i += 1) {
      const part = statements[i];
      if (part.keyword.toUpperCase() !== 'TYPES') break;
      if (/\bEND\s+OF\b/i.test(part.text)) break;
      const field = /^TYPES\s+([A-Za-z0-9_]+)\s+TYPE\b/i.exec(part.text);
      if (field) fields.push(field[1].toUpperCase());
    }
    if (fields.length > 0) {
      return { anchors, core: `Die lokale Struktur enthält ${enumerate(fields)}.`, tag: 'types' };
    }
  }

  if (keyword === 'TRANSLATE' && /\bUPPER\s+CASE\b/i.test(text)) {
    return {
      anchors,
      core: 'Die Eingabe wird in Großbuchstaben gewandelt.',
      notes: ['Eine Ablehnung der Eingabe gibt es nicht.'],
      tag: 'translate',
    };
  }

  // Ein Methodenaufruf, ob mit oder ohne Zuweisung: `lv_x = cls=>meth( … )`,
  // `obj->meth( … )`, `super->route( … )`. Was die Methode tut, steht nur dann
  // fest, wenn sie im gelieferten Code definiert ist — sonst wird es gesagt.
  const method = /([A-Za-z0-9_/<>]+)(?:=>|->)([A-Za-z0-9_]+)\s*\(/.exec(text);
  if (method) {
    const owner = method[1];
    const name = method[2];
    // F7: „nicht belegt" nur, wenn die Methode wirklich fehlt. Bis hierher
    // prüfte ein Muster auf `METHODS name` — in einem Template-String, in dem
    // `\s` zu `s` und `\b` zu einem Backspace wurde; es traf nie, und jede
    // Methode galt als fehlend, auch die im selben Quelltext implementierten.
    const head = methodImplementation(statements, owner, name);
    // F8: der Empfänger steht **links vom Gleichheitszeichen** — nicht vor dem
    // `=>` eines statischen Aufrufs. `/^([A-Za-z0-9_()]+)\s*=/` las in
    // `cl_salv_table=>factory( … )` das `=` des Pfeils und nannte die Klasse
    // als Empfänger ihres eigenen Rückgabewerts.
    const target = /^(?:DATA\(([A-Za-z0-9_]+)\)|([A-Za-z0-9_\-~>]+?))\s*=(?!>)/.exec(text);
    const receiver = target ? (target[1] ?? target[2]) : null;
    const exported = !receiver
      ? /\b(?:IMPORTING|RECEIVING)\s+\w+\s*=\s*(DATA\([A-Za-z0-9_]+\)|[A-Za-z0-9_\-~>]+)/i.exec(text)
      : null;
    const effects = head ? routineEffects(statements, head) : [];
    const core = receiver
      ? `Der Rückgabewert der Methode ${name} von ${owner} wird nach ${plain(receiver)} übernommen.`
      : `Die Methode ${name} von ${owner} wird aufgerufen${exported ? `; ihr Ergebnis wird in ${plain(exported[1])} übernommen` : ''}${effects.length > 0 ? `; sie ${enumerate(effects)}` : ''}.`;
    return {
      anchors,
      core,
      notes: head ? [] : ['Ihr fachliches Verhalten ist im gelieferten Code nicht belegt.'],
      tag: 'method',
    };
  }

  if (keyword === 'READ' && /^READ\s+TABLE\b/i.test(text)) {
    return { anchors, core: 'In der Tabelle wird nach einer passenden Zeile gesucht.', tag: 'read' };
  }

  if (keyword === 'LOOP') {
    const over = /^LOOP\s+AT\s+(\S+)/i.exec(text);
    return {
      anchors,
      core: `Jede Zeile ${over ? `aus ${plain(over[1])} ` : ''}wird einzeln verarbeitet.`,
      tag: 'loop',
    };
  }

  return null;
}

/**
 * Was ein Zweig **tut**, als Satzteil — „COMMIT WORK ausgeführt und RECORDED
 * ausgegeben".
 *
 * Ein Fachbereichsmensch liest eine Verzweigung als *eine* Aussage mit zwei
 * Ausgängen, nicht als sechs Anweisungen. Genau so steht sie auch im BPMN: ein
 * Gateway mit zwei Kanten. Erkannt wird nur, was hier benannt ist; eine
 * Anweisung ohne Satzteil wird übergangen, statt erfunden zu werden.
 */
function bodyFragment(statement: AbapStatement, origins: Map<string, ValueOrigin>, stacks?: Block[][]): string | null {
  const text = statement.text;
  const keyword = statement.keyword.toUpperCase();
  if (keyword === 'COMMIT') return 'COMMIT WORK ausgeführt';
  if (keyword === 'ROLLBACK') return 'ROLLBACK WORK ausgeführt';
  if (keyword === 'WRITE') {
    const formatted = WRITE_TO.exec(text);
    if (formatted) return `ein Wert aufbereitet in ${plain(formatted[2])} übernommen`;
    return `${writtenTarget(statement, origins).label} ausgegeben`;
  }
  if (keyword === 'RETURN') return 'der Block verlassen';
  if (keyword === 'EXIT') {
    const stack = stacks?.[statement.index] ?? [];
    const innermost = [...stack].reverse().find((block) => block.kind === 'loop' || block.kind === 'routine');
    return innermost?.kind === 'loop' ? 'die Schleife verlassen' : 'der Block verlassen';
  }
  if (keyword === 'CONTINUE') return 'der Schleifendurchlauf übersprungen';
  if (keyword === 'LEAVE') return leavePhrase(statement) ?? 'die aktuelle Verarbeitung verlassen';
  if (keyword === 'MESSAGE') return messageFragment(text);
  if (keyword === 'MODIFY') return 'eine Zeile eingefügt oder überschrieben';
  if (keyword === 'APPEND') return 'eine Zeile aufgenommen';
  if (keyword === 'UPDATE') return 'eine Zeile geändert';
  if (keyword === 'PERFORM') {
    const name = /^PERFORM\s+([A-Za-z0-9_]+)/i.exec(text);
    return name ? `${name[1]} aufgerufen` : null;
  }
  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) return `${literalOf(fn[1]) ?? fn[1]} aufgerufen`;
    return null;
  }
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(text);
  if (assign) return `die ${termFor(assign[1]).singular} auf ${literalOf(assign[2]) ?? assign[2]} gesetzt`;
  return null;
}

/** Eine interne Tabelle, an ihrem Präfix erkannt. */
const INTERNAL_TABLE = /^@?[lgie]t_/i;

interface Branch {
  head: AbapStatement;
  kind: 'if' | 'elseif' | 'else';
  previous?: AbapStatement;
  body: AbapStatement[];
}

/** Die Zweige einer `IF … ELSEIF … ELSE … ENDIF`-Kette ab `index`. */
function branchChain(statements: readonly AbapStatement[], index: number, loops: ReadonlySet<number>): Branch[] | null {
  if (statements[index].keyword.toUpperCase() !== 'IF') return null;
  const branches: Branch[] = [];
  let current: Branch = { head: statements[index], kind: 'if', body: [] };
  let depth = 0;
  for (let i = index + 1; i < statements.length; i += 1) {
    const statement = statements[i];
    const keyword = statement.keyword.toUpperCase();
    if (depth === 0 && (keyword === 'ELSEIF' || keyword === 'ELSE')) {
      branches.push(current);
      current = {
        head: statement,
        kind: keyword === 'ELSE' ? 'else' : 'elseif',
        previous: branches[branches.length - 1].head,
        body: [],
      };
      continue;
    }
    if (depth === 0 && keyword === 'ENDIF') {
      branches.push(current);
      return branches;
    }
    if (opens(statement, loops)) depth += 1;
    else if (CLOSERS.has(keyword)) depth -= 1;
    if (depth === 0) current.body.push(statement);
  }
  return null;
}

/**
 * Der Satzanfang eines Zweigs. `chainHead` ist die Stelle des `IF` — auch für
 * ein `ELSEIF sy-subrc …` zählt die Anweisung vor dem `IF`, denn was zwischen
 * `IF` und `ELSEIF` steht, gehört zum vorigen Zweig und läuft hier nicht.
 */
function branchSubject(branch: Branch, statements: readonly AbapStatement[], chainHead: number): Lead {
  if (branch.kind === 'else') {
    const subject = elseSubject(branch.previous);
    return lead(subject === 'Sonst' ? subject : `Für ${lowerFirst(subject)}`);
  }
  const head = branch.head.text;
  const subrc = /^(?:IF|ELSEIF)\s+sy-subrc\s*(<>|=|NE|EQ)\s*0\s*$/i.exec(head);
  if (subrc) {
    const result = subrcOutcome(statements, chainHead);
    return /^(?:<>|NE)$/i.test(subrc[1]) ? result.fail : result.ok;
  }
  const initial = /^(?:IF|ELSEIF)\s+(\S+)\s+IS\s+(NOT\s+)?INITIAL\s*$/i.exec(head);
  if (initial) return initialLead(initial[1], statements, chainHead, Boolean(initial[2]));
  const flag = /^(?:IF|ELSEIF)\s+(\S+)\s*(<>|=)\s*'X'\s*$/i.exec(head);
  if (flag) return lead(flag[2] === '=' ? `Mit gesetztem ${plain(flag[1])}` : `Ohne gesetztes ${plain(flag[1])}`);
  // „Beträge größer 10000" ist ein Subjekt, kein Satzanfang vor „wird".
  // Das Fallbuch schreibt an dieser Stelle „Für größere Beträge wird …", und
  // genau diese Form trägt auch einen erzeugten Satz.
  return lead(`Für ${lowerFirst(conditionSubject(head).subject)}`);
}

/**
 * Erster Buchstabe klein — aber **nur** bei einem Adjektiv.
 *
 * Deutsch schreibt Substantive groß, auch mitten im Satz: „Für Beträge größer
 * 10000" ist richtig, „für beträge" ist es nicht. Klein wird deshalb nur, was
 * hier als Adjektiv aufgeführt ist, und nichts sonst.
 */
const LEADING_ADJECTIVES = new Set(['Negative', 'Nicht', 'Größere', 'Kleinere', 'Andere']);

function lowerFirst(text: string): string {
  const [first] = text.split(' ');
  if (!LEADING_ADJECTIVES.has(first)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * Die Sätze einer Verzweigung: je Zweig einer, und für `IF … ELSE` zusätzlich
 * der Satz über beide Ausgänge — „Bei Treffer wird X ausgegeben, sonst Y".
 */
function branchSentences(
  statements: readonly AbapStatement[],
  index: number,
  origins: Map<string, ValueOrigin>,
  loops: ReadonlySet<number>,
  stacks: Block[][],
  guard?: Draft | null,
): Draft[] {
  const branches = branchChain(statements, index, loops);
  if (!branches) return [];
  const drafts: Draft[] = [];
  const parts: Array<{ branch: Branch; subject: Lead; phrase: string }> = [];
  for (const branch of branches) {
    // Steht ein Wächter auf demselben IF, spricht der erste Zweig mit seiner
    // Bedingung und sagt, wovor der Rücksprung schützt (F11: ein Satz statt zwei).
    const guarded = guard && branch.kind === 'if' ? guard : null;
    const fragments = branch.body
      .map((statement) => {
        const fragment = bodyFragment(statement, origins, stacks);
        const leave = guarded?.anchors[guarded.anchors.length - 1];
        return guarded?.exit && leave && statement.lineStart === leave.lineStart ? guarded.exit : fragment;
      })
      .filter((fragment): fragment is string => fragment !== null);
    if (fragments.length === 0) continue;
    const phrase = enumerate(fragments);
    const subject = guarded?.subject ?? branchSubject(branch, statements, index);
    parts.push({ branch, subject, phrase });
    drafts.push({
      anchors: [range(branch.head), ...branch.body.map(range)],
      core: `${compose(subject, phrase)}.`,
      grain: 'group',
      tag: `branch${branch.head.lineStart}`,
    });
  }
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    // „…, sonst Y" ist nur wahr, wenn Y der einzige andere Ausgang ist: ein
    // ELSE direkt hinter dem ersten Zweig. Ein ELSEIF hat eine eigene
    // Bedingung, und die gehört in den Satz, statt in einem „sonst" zu
    // verschwinden.
    const plainElse = parts.length === branches.length && rest.length === 1 && rest[0].branch.kind === 'else';
    drafts.push({
      anchors: [
        range(first.branch.head),
        ...parts.flatMap((part) => [range(part.branch.head), ...part.branch.body.map(range)]),
      ],
      core: plainElse
        ? `${compose(first.subject, first.phrase)}, sonst ${rest[0].phrase}.`
        : parts.map((part) => `${compose(part.subject, part.phrase)}.`).join(' '),
      grain: 'group',
      tag: `chain${first.branch.head.lineStart}`,
    });
  }
  // F11: ein IF … ELSE ist **eine** Entscheidung mit zwei Ausgängen — dafür
  // steht der „…, sonst …"-Satz, und die Einzelsätze der Zweige sagten
  // dasselbe noch einmal. Bei ELSEIF-Ketten ist der Kettensatz nur die
  // Aneinanderreihung der Zweigsätze; dort bleiben die Zweige.
  const chain = drafts.find((draft) => draft.tag?.startsWith('chain'));
  if (chain && /, sonst /.test(chain.core)) return [chain];
  return drafts.filter((draft) => !draft.tag?.startsWith('chain'));
}

/**
 * Ein gerader Lauf von Anweisungen ist **eine** fachliche Aussage.
 *
 * `COMMIT WORK.` und `WRITE / 'RECORDED'.` nacheinander sind für einen
 * Fachbereichsmenschen ein Schritt: „es wird festgeschrieben und bestätigt".
 * Im BPMN ist das eine Aktivität, nicht zwei — und das Fallbuch verankert
 * solche Aussagen auch auf allen beteiligten Zeilen.
 */
function sequenceSentences(
  statements: readonly AbapStatement[],
  stacks: Block[][],
  origins: Map<string, ValueOrigin>,
): Draft[] {
  const drafts: Draft[] = [];
  let run: AbapStatement[] = [];
  let fragments: string[] = [];
  let depth = -1;
  const flush = () => {
    // Ein Lauf aus lauter `WRITE` ist die Ausgabeliste — dafür gibt es
    // `listSentence`, und zwei Sätze über dieselbe Liste sind einer zu viel.
    const onlyOutput = run.every((statement) => isOutputWrite(statement));
    if (run.length >= 2 && !onlyOutput) {
      drafts.push({
        anchors: run.map(range),
        core: `Es wird ${enumerate(fragments)}.`,
        grain: 'group',
        tag: `seq${run[0].lineStart}`,
      });
    }
    run = [];
    fragments = [];
  };
  for (let i = 0; i < statements.length; i += 1) {
    const fragment = bodyFragment(statements[i], origins, stacks);
    const level = stacks[i].length;
    if (fragment === null || (run.length > 0 && level !== depth)) {
      flush();
      if (fragment === null) continue;
    }
    if (run.length === 0) depth = level;
    run.push(statements[i]);
    fragments.push(fragment);
  }
  flush();
  return drafts;
}

/**
 * Das Ergebnis eines Aufrufs, als eigene Aussage neben dem Aufruf selbst.
 *
 * „Was wird gerufen" und „was kommt zurück" sind zwei fachliche Sätze über
 * dieselbe Anweisung, und das Fallbuch führt sie auch als zwei (CC-006-B01
 * nennt das Aufrufziel, CC-006-B02 die Übernahme des Ergebnisses). Der
 * Vergleicher ordnet eins zu eins zu: ein erzeugter Satz kann nie zwei
 * Sollsätze gutschreiben, und mehrere Sätze an einer Anweisung sind deshalb
 * keine zweite Chance, sondern zwei Aussagen.
 */
function resultSentence(statement: AbapStatement, statements: readonly AbapStatement[]): Draft | null {
  if (!/^CALL\s+FUNCTION\b/i.test(statement.text)) return null;
  if (/\bIN\s+UPDATE\s+TASK\b|\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text)) return null;
  const importing = /\bIMPORTING\s+\w+\s*=\s*(\S+)/i.exec(statement.text);
  if (!importing) return null;
  // F10: „das konvertierte Ergebnis" stand an jedem Bausteinaufruf mit
  // IMPORTING — gelesen aus dem Namen eines einzigen Konvertierungsbausteins.
  // Was der Baustein zurückgibt, ist sein Ergebnis; mehr sagt der Code nicht.
  const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(statement.text);
  const name = fn ? (resolveValue(fn[1], statements, statement.index).value ?? plain(fn[1])) : '';
  return {
    anchors: [range(statement)],
    core: `Das Ergebnis von ${name} wird in ${plain(importing[1])} übernommen.`,
    tag: 'result',
  };
}

/**
 * Die Ausgabeliste: aufeinanderfolgende `WRITE` in derselben Schleife sind
 * **eine** fachliche Aussage — „Bei Treffern werden Kundennummer und Name als
 * Liste ausgegeben", nicht drei Sätze über drei Spalten.
 */
function listSentence(
  group: AbapStatement[],
  inLoop: boolean,
  origins: Map<string, ValueOrigin>,
): Draft | null {
  if (group.length === 0) return null;
  const targets = group.map((statement) => writtenTarget(statement, origins));
  if (targets.every((target) => target.literal)) return null;
  const labels = targets.map((target) => target.label);
  const anchors = group.map(range);
  if (inLoop) {
    return {
      anchors,
      core: `Bei Treffern werden ${enumerate(labels)} als Liste ausgegeben.`,
      grain: 'group',
      tag: 'list',
    };
  }
  if (group.length === 1) return null;
  return { anchors, core: `${enumerate(labels)} werden ausgegeben.`, grain: 'group', tag: 'list' };
}

/**
 * Alle Fachsätze eines Quelltexts, in der Reihenfolge des Programms.
 *
 * Deterministisch: dieselbe Quelle ergibt dieselben Sätze, Wort für Wort und
 * Anker für Anker. Kein Modell, kein Netz, kein Schlüssel.
 *
 * Es entstehen **zwei Körnungen** (`grain`), und das ist kein Zufall: die
 * Business-Sicht zeigt am BPMN-Element den Satz des Blocks (ein Wächter ist ein
 * Gateway mit zwei Kanten, nicht drei Kästen), die Zeilenansicht den Satz der
 * einzelnen Anweisung. `attachTo` wählt je Knoten.
 */
export function buildBusinessStatements(source: string): BusinessStatement[] {
  const statements = readStatements(source);
  // Dieselbe Lesung wie im Skelett: der Satz verdichtet den Wirkungsstatus
  // des Modells (2.12), er bildet keinen eigenen.
  const luw = readLuwStates(buildProcessFacts(source));
  const loops = selectLoops(statements);
  const stacks = blockStacks(statements, loops);
  const origins = originMap(statements);
  const context: SourceContext = { stacks, loops, tables: internalTables(statements) };
  const out: BusinessStatement[] = [];

  // F11: ein Satz je Aussage. Was ein gröberer Satz schon sagt — der Zweig
  // mit seiner Bedingung, die Ausgabeliste mit allen Spalten —, sagt kein
  // zweiter Satz an derselben Stelle noch einmal ohne Bedingung.
  const inBranch = new Set<number>();
  for (let i = 0; i < statements.length; i += 1) {
    // Wächter und erster Zweig sind dieselbe Aussage über dasselbe IF. Der
    // Zweig nennt alles, was er tut; vom Wächter übernimmt er Satzanfang und
    // das, was nur der Wächter weiß — wovor der Rücksprung schützt.
    const guard = guardSentence(statements, i, origins, context);
    const branches = branchSentences(statements, i, origins, loops, stacks, guard);
    const first = branches.find(
      (draft) => draft.tag === `branch${statements[i].lineStart}` || draft.tag === `chain${statements[i].lineStart}`,
    );
    if (guard && !first) out.push(build(guard));
    for (const draft of branches) {
      out.push(build(draft));
      for (const anchor of draft.anchors.slice(1)) {
        const covered = statements.find((statement) => statement.lineStart === anchor.lineStart);
        if (covered) inBranch.add(covered.index);
      }
    }
  }
  for (const draft of sequenceSentences(statements, stacks, origins)) {
    // Eine Folge, die ganz in einem Zweig liegt, hat der Zweig schon gesagt.
    const indices = draft.anchors.map((anchor) => statements.find((s) => s.lineStart === anchor.lineStart)?.index ?? -1);
    if (indices.every((index) => inBranch.has(index))) continue;
    out.push(build(draft));
  }

  // Ausgabeläufe: zusammenhängende WRITEs im selben Block.
  const listed = new Set<number>();
  let run: AbapStatement[] = [];
  let runStack: Block[] = [];
  const flush = () => {
    if (run.length > 0) {
      // „Bei Treffern" trägt nur eine Ausgabe, die **unmittelbar** in der
      // Schleife steht; in einem Zweig der Schleife hängt sie an dessen
      // Bedingung, nicht an einem Treffer.
      const draft = listSentence(run, runStack[runStack.length - 1]?.kind === 'loop', origins);
      if (draft) {
        // Eine Liste, die ganz in einem Zweig steht, nennt der Zweig schon —
        // mit seiner Bedingung. Ihre Spalten bekommen dann auch keinen eigenen Satz.
        if (!run.every((statement) => inBranch.has(statement.index))) out.push(build(draft));
        for (const statement of run) listed.add(statement.index);
      }
    }
    run = [];
  };
  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (isOutputWrite(statement)) {
      if (run.length === 0) runStack = stacks[i];
      run.push(statement);
    } else if (!['ENDLOOP', 'ENDIF', 'ENDSELECT'].includes(statement.keyword.toUpperCase())) {
      flush();
    }
  }
  flush();

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    const stack = stacks[i];
    const branch = branchAssignment(statement, stack);
    if (branch) {
      out.push(build(branch));
      continue;
    }
    const plainSet = plainAssignment(statement);
    if (plainSet) {
      out.push(build(plainSet));
      continue;
    }
    // Eine Spalte, die schon in der Ausgabeliste steht, bekommt keinen
    // eigenen „x wird ausgegeben"-Satz daneben.
    if (listed.has(statement.index) && !literalOf(writeBody(statement).replace(/\(\w{1,3}\)$/, ''))) continue;
    const draft = sentenceFor(statement, statements, stack, origins, luw);
    if (draft) out.push(build(draft));
    const result = resultSentence(statement, statements);
    // „übergibt … und übernimmt dessen Ausgabe nach y" sagt das Ergebnis schon.
    if (result && !(draft && /übernimmt dessen Ausgabe nach/.test(draft.core))) out.push(build(result));
    const fields = resultFieldsSentence(statement);
    if (fields) out.push(build(fields));
  }

  // Zwei Wege können denselben Satz an denselben Ankern bilden — ein Wächter
  // ist auch ein Zweig. Zweimal dasselbe ist kein zweiter Fachsatz.
  const seen = new Set<string>();
  const unique = out.filter((statement) => {
    const key = `${statement.text}@${statement.anchors.map((a) => `${a.lineStart}-${a.lineEnd}`).join(',')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.sort((a, b) => a.anchors[0].lineStart - b.anchors[0].lineStart || a.id.localeCompare(b.id));
}

/**
 * Den Fachsatz an das Element hängen — Forderung 2, ohne das Skelett zu ändern.
 *
 * Das Skelett geht unverändert hinein und unverändert wieder heraus; was
 * zurückkommt, ist eine **Zuordnung** von Knoten-Id auf Fachsatz. Damit bleibt
 * Regel 6 dort, wo sie steht: die Beschriftung des Knotens ist weiter ein
 * wörtliches Token, der Fachsatz eine eigene Ebene daneben.
 *
 * Gewählt wird je Knoten der Satz, dessen Anker die Zeile des Knotens
 * **enthält**, und unter mehreren der gröbere (`group` vor `statement`) — ein
 * Gateway aus drei Anweisungen sagt einen Satz, nicht drei.
 */
export function attachTo(
  nodes: ReadonlyArray<{ id: string; anchor?: { lineStart: number; lineEnd: number } | null }>,
  statements: readonly BusinessStatement[],
): Map<string, BusinessStatement> {
  const byNode = new Map<string, BusinessStatement>();
  for (const node of nodes) {
    const anchor = node.anchor;
    if (!anchor) continue;
    const candidates = statements.filter((statement) =>
      statement.anchors.some((span) => span.lineStart <= anchor.lineEnd && anchor.lineStart <= span.lineEnd),
    );
    if (candidates.length === 0) continue;
    const best =
      candidates.find((statement) => statement.grain === 'group') ?? candidates[0];
    byNode.set(node.id, best);
  }
  return byNode;
}
