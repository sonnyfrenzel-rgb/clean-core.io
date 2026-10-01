/**
 * Der Fachsatz — was ein Stück ABAP **fachlich** tut, in einem Satz am Element.
 *
 * **The sentences are English** (owner decision 01.10.2026, "alles Englisch"):
 * the business statement is product text, and every product text is English.
 * The engine reads the same evidence and says the same thing it said in
 * German — same anchors, same caveats, same determinism; only the language of
 * the sentence changed. `tests/business-statement-english.spec.ts` holds it.
 * The comments below are the module's design notes from before the switch.
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
import { genitivePhrase, isKnownField, nounPhrase, tableTerm, termFor, type BusinessTerm } from './business-glossary';
import { buildProcessFacts } from './process-facts';
import { readLuwStates, type LuwModel } from './luw-states';
import { readReferenceTypes, resolveMethodTarget, type ClassModel, type MethodTarget } from './method-resolution';

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
  let foundAt = -1;
  let usedAt = statements.length;
  const seen = new Set<string>();
  for (let position = 0; position < statements.length; position += 1) {
    const statement = statements[position];
    if (statement.index >= before) { usedAt = position; break; }
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
        foundAt = position;
      }
      continue;
    }
    // Wird die Variable auch **anders** gefüllt — aus einer Tabelle gelesen,
    // von einem Aufruf zurückgegeben, aus einem anderen Feld kopiert —, dann
    // ist ein Literal daneben nur einer von mehreren möglichen Werten, oft
    // der Vorschlag für den Fall, dass nichts gepflegt ist. Es als „festgelegt"
    // auszugeben hieße, den Rückfall für die Regel zu halten.
    if (writesVariable(text, needle)) seen.add(`\u0000${statement.index}`);
  }
  if (seen.size > 1) return { value: null, from: 'unresolved', line: null };
  // Eine einzige Zuweisung ist nur dann *der* Wert, wenn sie auf jedem Weg zur
  // fragenden Stelle läuft. Steht sie in einem Zweig, einer Schleife oder einer
  // Routine, die die fragende Stelle nicht mit umschließt, lief sie auf manchen
  // Wegen nicht — dann steht der Wert erst zur Laufzeit fest.
  if (foundAt !== -1 && !assignmentReaches(statements, foundAt, usedAt)) {
    return { value: null, from: 'unresolved', line: null };
  }
  return found;
}

const STACKS = new WeakMap<readonly AbapStatement[], Block[][]>();

/**
 * Ob die Zuweisung an Position `from` die Stelle `to` auf jedem Weg erreicht:
 * jeder Block um die Zuweisung — jeder Zweig (`IF`, `ELSE`, `WHEN` sind je ein
 * eigener), jede Schleife, jede Routine — umschließt auch die fragende Stelle.
 */
function assignmentReaches(statements: readonly AbapStatement[], from: number, to: number): boolean {
  let stacks = STACKS.get(statements);
  if (!stacks) {
    stacks = blockStacks(statements, selectLoops(statements));
    STACKS.set(statements, stacks);
  }
  const around = stacks[from] ?? [];
  const atUse = new Set(stacks[to] ?? []);
  return around.every((block) => atUse.has(block));
}

/**
 * Woher ein erst zur Laufzeit bekannter Name kommt — nur so weit, wie der
 * Code es zeigt. „Entscheidet die Eingabe" steht nur bei einem Feld des
 * Selektionsbilds; ein Importparameter kommt vom Aufrufer; alles andere
 * (gelesen aus einer Pflegetabelle, berechnet) steht einfach erst zur
 * Laufzeit fest.
 */
function runtimeNote(question: string, variable: string, statements: readonly AbapStatement[]): string {
  const name = plain(variable).toLowerCase();
  const declared = statements.some((statement) =>
    new RegExp(`^(?:PARAMETERS|SELECT-OPTIONS)\\s+${escapeForRegExp(name)}\\b`, 'i').test(statement.text),
  );
  if (fromSelectionScreen(name) || declared) return `At runtime, the input decides ${question}.`;
  if (/^(?:iv|im|i|is|it)_/i.test(name)) return `At runtime, the caller decides ${question}.`;
  return `Only at runtime does ${plain(variable)} settle ${question}.`;
}

/** Ob eine Anweisung die Variable `needle` anders als mit einem Literal füllt. */
function writesVariable(text: string, needle: string): boolean {
  const name = escapeForRegExp(needle);
  const target = `@?(?:DATA\\()?${name}\\)?(?![\\w-])`;
  if (new RegExp(`^(?:DATA\\()?${name}\\)?\\s*=\\s*(?!'[^']*'\\s*$|\`[^\`]*\`\\s*$)\\S`, 'i').test(text)) return true;
  if (new RegExp(`\\bINTO\\s+(?:TABLE\\s+|CORRESPONDING\\s+FIELDS\\s+OF\\s+)?${target}`, 'i').test(text)) return true;
  if (new RegExp(`\\b(?:IMPORTING|CHANGING|RECEIVING)\\b.*\\b\\w+\\s*=\\s*${target}`, 'i').test(text)) return true;
  if (new RegExp(`^MOVE\\s+.+\\s+TO\\s+${target}`, 'i').test(text)) return true;
  if (new RegExp(`^GET\\s+PARAMETER\\s+ID\\s+\\S+\\s+FIELD\\s+${target}`, 'i').test(text)) return true;
  return false;
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
      `Business statement ${statement.id} has no core sentence. 17.7: "not-determined" must never take the place of a statement.`,
    );
  }
  if (statement.provenance !== 'reconstructed') {
    throw new Error(`Business statement ${statement.id} carries a foreign provenance — engine sentences are "reconstructed".`);
  }
  if (statement.anchors.length === 0) {
    throw new Error(`Business statement ${statement.id} is not anchored.`);
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

/** The routine with its name: "the subroutine pruefen". */
function routineLabel(head: AbapStatement): string {
  const match = /^(FORM|METHOD|MODULE|FUNCTION)\s+([A-Za-z0-9_~/]+)/i.exec(head.text);
  if (!match) return 'the routine';
  const name = match[2];
  switch (match[1].toUpperCase()) {
    case 'FORM':
      return `the subroutine ${name}`;
    case 'METHOD':
      return `the method ${name}`;
    case 'MODULE':
      return `the dialog module ${name}`;
    default:
      return `the function module ${name}`;
  }
}

/** Der Block, den ein CHECK oder RETURN außerhalb jeder Schleife verlässt — mit Namen. */
function unitLabel(unit: Unit): string {
  if (unit.kind === 'routine' && unit.head) return routineLabel(unit.head);
  if (unit.kind === 'event' && unit.head) {
    return `the event block ${unit.head.text.trim().replace(/\s+/g, ' ').toUpperCase()}`;
  }
  return 'the current processing block';
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
  // Ein Feldsymbol `<ls_x>-feld` verliert seine Klammern ganz, nicht nur die erste.
  return text.trim().replace(/<([A-Za-z0-9_]+)>/g, '$1').replace(/^[@(<]+/, '').replace(/[)>]+$/, '').trim();
}

/** Ob ein Bezeichner vom Selektionsbild kommt — `p_…`, `s_…`. */
function fromSelectionScreen(identifier: string): boolean {
  return /^[@]?[ps]_/i.test(identifier.trim());
}

/** Erster Buchstabe groß — für eine Nominalgruppe am Satzanfang. */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * A business word at the start of a sentence: capitalised — but an identifier
 * the glossary did not know stays exactly as the source writes it.
 */
function capitalizeWord(word: string): string {
  return /[_\-~<>/]/.test(word) || /[A-Z]/.test(word) ? word : capitalize(word);
}

/** Eine Aufzählung, wie man sie spricht: „A, B und C". */
function enumerate(parts: string[]): string {
  const unique = parts.filter((part, index) => part && parts.indexOf(part) === index);
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return `${unique.slice(0, -1).join(', ')} and ${unique[unique.length - 1]}`;
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
    const plural = capitalizeWord(word.plural);
    if (operator === '<' && value === '0') return { subject: `Negative ${word.plural}`, term: word, comparison: operator };
    if (operator === '>=' && value === '0') return { subject: `Non-negative ${word.plural}`, term: word, comparison: operator };
    if (operator === '>') return { subject: `${plural} greater than ${value}`, term: word, comparison: operator };
    if (operator === '<') return { subject: `${plural} less than ${value}`, term: word, comparison: operator };
    if (operator === '<=') return { subject: `${plural} up to and including ${value}`, term: word, comparison: operator };
    if (operator === '>=') return { subject: `${plural} of ${value} or more`, term: word, comparison: operator };
    if (operator === '=') return { subject: `${plural} with the value ${value}`, term: word, comparison: operator };
    if (operator === '<>') return { subject: `${plural} not equal to ${value}`, term: word, comparison: operator };
  }
  const initial = /^(\S+)\s+IS\s+(NOT\s+)?INITIAL$/i.exec(text);
  if (initial) {
    const word = termFor(initial[1]);
    return {
      subject: initial[2] ? `A non-empty ${word.singular}` : `An empty ${word.singular}`,
      term: word,
      comparison: null,
    };
  }
  return { subject: text, term: null, comparison: null };
}

const OPERATOR_WORDS: Record<string, string> = {
  '=': 'is',
  EQ: 'is',
  '<>': 'is not',
  NE: 'is not',
  '>': 'is greater than',
  GT: 'is greater than',
  '<': 'is less than',
  LT: 'is less than',
  '>=': 'is at least',
  GE: 'is at least',
  '<=': 'is at most',
  LE: 'is at most',
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
  const literally = `the condition "${text}" holds`;
  // Eine reine UND- oder reine ODER-Kette ohne Klammern ist eine Aufzählung
  // einfacher Bedingungen; jede Mischung und jede Klammer bleibt wörtlich.
  if (!/[()]/.test(text)) {
    for (const [connector, word] of [['AND', 'and'], ['OR', 'or']] as const) {
      const parts = text.split(connector === 'AND' ? /\s+AND\s+/i : /\s+OR\s+/i);
      const other = connector === 'AND' ? /\sOR\s/i : /\sAND\s/i;
      if (parts.length > 1 && !other.test(text) && !/\bBETWEEN\b/i.test(text)) {
        const clauses = parts.map((part) => conditionClause(part, subrc));
        if (clauses.every((clause) => !clause.startsWith('the condition'))) {
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
      return `the return code (sy-subrc) is ${initial[2] ? 'not ' : ''}0`;
    }
    return `${nounPhrase(initial[1])} is ${initial[2] ? 'not ' : ''}empty`;
  }
  const bound = /^(\S+)\s+IS\s+(NOT\s+)?(BOUND|ASSIGNED|SUPPLIED|REQUESTED)$/i.exec(text);
  if (bound) {
    const word = { BOUND: 'bound', ASSIGNED: 'assigned', SUPPLIED: 'supplied', REQUESTED: 'requested' }[
      bound[3].toUpperCase() as 'BOUND'
    ];
    return `${nounPhrase(bound[1])} is ${bound[2] ? 'not ' : ''}${word}`;
  }
  const selection = /^(\S+)\s+(NOT\s+)?IN\s+(\S+)$/i.exec(text);
  if (selection) {
    return `${nounPhrase(selection[1])} is ${selection[2] ? 'not ' : ''}in the selection ${plain(selection[3])}`;
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
      return `the return code (sy-subrc) is ${equal ? '' : 'not '}${valueText(right)}`;
    }
    if ((equal || unequal) && (TRUE_VALUES.test(right) || FALSE_VALUES.test(right))) {
      const set = TRUE_VALUES.test(right) === equal;
      return `${nounPhrase(left)} is ${set ? '' : 'not '}set`;
    }
    return `${nounPhrase(left)} ${OPERATOR_WORDS[operator]} ${valueText(right)}`;
  }
  const exists = /^line_exists\(\s*([A-Za-z0-9_\-<>]+)\[/i.exec(text);
  if (exists) return `a matching row exists in ${plain(exists[1])}`;
  return literally;
}

/**
 * Das Mehrzahl-Subjekt aus `conditionSubject` — aber nur, wenn es ein
 * Deutsch-Subjekt ist: ein Vergleich über ein **bekanntes** Fachwort
 * („Beträge größer 10000"). Über einen unbekannten Bezeichner ergäbe es
 * „lv_frei bis einschließlich 0 setzen …", und dann steht besser der
 * Bedingungssatz da (F12).
 */
function pluralSubject(condition: string): string | null {
  const text = condition.replace(/^(IF|ELSEIF|WHILE|CHECK)\s+/i, '').trim();
  const compare = /^(\S+)\s*(<=|>=|<>|<|>|=)\s*(\S+)$/.exec(text);
  if (!compare || !isKnownField(compare[1])) return null;
  if (TRUE_VALUES.test(compare[3]) || FALSE_VALUES.test(compare[3])) return null;
  return conditionSubject(text).subject;
}

/** Das Gegenstück zu `conditionSubject` für einen `ELSE`-Zweig. */
function elseSubject(previous: AbapStatement | undefined): string {
  if (!previous) return 'Otherwise';
  const { subject, term, comparison } = conditionSubject(previous.text);
  if (!term || !comparison || pluralSubject(previous.text) === null) return 'Otherwise';
  // Das Gegenteil hält die Grenze: nach `< 100` gehört 100 in den ELSE-Zweig,
  // nach `<= 100` nicht (wie `CHECK_COMPLEMENT` für `CHECK`).
  if (comparison === '<') return `Equal or greater ${term.plural}`;
  if (comparison === '<=') return `Greater ${term.plural}`;
  if (comparison === '>') return `Equal or smaller ${term.plural}`;
  if (comparison === '>=') return `Smaller ${term.plural}`;
  return `Other ${term.plural}`;
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
  'function-return': 'the field returned by the function module',
  'method-return': 'the return value',
};

/** Welche Variablen eine Anweisung mit dem Ergebnis eines Aufrufs füllt. */
function originsSetBy(text: string): Array<[string, ValueOrigin]> {
  const out: Array<[string, ValueOrigin]> = [];
  if (/^CALL\s+FUNCTION\b/i.test(text)) {
    for (const match of text.matchAll(/\b(?:IMPORTING|CHANGING|RECEIVING)\s+\w+\s*=\s*(\S+)/gi)) {
      out.push([plain(match[1]).toLowerCase(), 'function-return']);
    }
    return out;
  }
  if (/^RECEIVE\s+RESULTS\b/i.test(text)) {
    for (const match of text.matchAll(/\bIMPORTING\s+\w+\s*=\s*(\S+)/gi)) {
      out.push([plain(match[1]).toLowerCase(), 'function-return']);
    }
    return out;
  }
  if (/^CALL\s+METHOD\b/i.test(text)) {
    for (const match of text.matchAll(/\b(?:RECEIVING|IMPORTING|CHANGING)\s+\w+\s*=\s*(\S+)/gi)) {
      out.push([plain(match[1]).toLowerCase(), 'method-return']);
    }
    return out;
  }
  // `DATA(lv_x) = cls=>meth( … )` und `lv_x = obj->meth( … )`.
  const call = /^(?:DATA\()?([A-Za-z0-9_]+)\)?\s*=(?!>)\s*\S+(?:=>|->)\w+\s*\(/.exec(text);
  if (call) out.push([call[1].toLowerCase(), 'method-return']);
  return out;
}

const ROUTINE_EDGES = new Set([
  'FORM', 'ENDFORM', 'METHOD', 'ENDMETHOD', 'MODULE', 'ENDMODULE', 'FUNCTION', 'ENDFUNCTION',
]);

/**
 * Die Herkunft je Ausgabe, nicht je Name: Schlüssel ist `index|variable` des
 * `WRITE`. Eine Herkunft gilt nur, solange die Variable seit dem Aufruf nicht
 * anders beschrieben wurde, und nur in der Routine, in der der Aufruf steht —
 * ein `lv_x` in einer anderen Methode ist eine andere Variable.
 */
function originMap(statements: readonly AbapStatement[]): Map<string, ValueOrigin> {
  const origins = new Map<string, ValueOrigin>();
  const live = new Map<string, ValueOrigin>();
  for (const statement of statements) {
    const text = statement.text;
    const keyword = statement.keyword.toUpperCase();
    if (ROUTINE_EDGES.has(keyword)) {
      live.clear();
      continue;
    }
    if (keyword === 'WRITE') {
      for (const [name, origin] of live) origins.set(`${statement.index}|${name}`, origin);
    }
    const set = originsSetBy(text);
    for (const name of [...live.keys()]) {
      if (set.some(([target]) => target === name)) continue;
      const escaped = escapeForRegExp(name);
      const overwritten =
        writesVariable(text, name) ||
        new RegExp(`^(?:DATA\\()?${escaped}\\)?\\s*=`, 'i').test(text) ||
        new RegExp(`^(?:CLEAR|FREE)\\b.*\\b${escaped}\\b(?![\\w-])`, 'i').test(text) ||
        new RegExp(`^WRITE\\b.*\\bTO\\s+${escaped}\\b(?![\\w-])`, 'i').test(text);
      if (overwritten) live.delete(name);
    }
    for (const [name, origin] of set) live.set(name, origin);
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
  const origin = origins?.get(`${statement.index}|${plain(cut).toLowerCase()}`);
  if (origin && origin !== 'none') return { label: ORIGIN_TERMS[origin], literal: false };
  return { label: isKnownField(cut) ? `the ${termFor(cut).singular}` : termFor(cut).singular, literal: false };
}

/** Der Satz zu `WRITE x TO y` — Formatierung in ein Feld, keine Ausgabe (F5). */
function writeToSentence(statement: AbapStatement): string | null {
  const match = WRITE_TO.exec(statement.text);
  if (!match) return null;
  const source = match[1].replace(/^\/\s*/, '');
  const shown = literalOf(source) ?? plain(source);
  return `The value ${shown} is formatted into ${plain(match[2])}; nothing is output.`;
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
  let subject = entity ? entity.plural : rawFrom ? `records from ${rawFrom}` : 'records';

  if (fromMatch && /^\(/.test(fromMatch[1])) {
    const resolved = resolveValue(rawFrom ?? '', statements, statement.index);
    if (resolved.value) {
      entity = tableTerm(resolved.value);
      subject = entity ? entity.plural : `records from ${resolved.value}`;
      notes.push(
        `The table is fixed by ${resolved.from === 'constant' ? 'the constant' : 'the assignment'} in line ${resolved.line}.`,
      );
    } else {
      notes.push(runtimeNote('which table this is', rawFrom ?? '', statements));
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
        if (fromSelectionScreen(compare[2])) filters.push(`the entered ${word.singular}`);
        else if (/^@?sy-mandt$/i.test(compare[2])) filters.push('the logon client');
      }
    }
  }
  // FOR ALL ENTRIES: gelesen wird zu den Zeilen einer internen Tabelle —
  // das gehört in den Satz, sonst klingt er nach „alle Kunden".
  const entries = /\bFOR\s+ALL\s+ENTRIES\s+IN\s+@?([A-Za-z0-9_\-<>]+)/i.exec(text);
  const restriction =
    (filters.length > 0 ? ` with ${enumerate(filters)}` : '') + (entries ? ` for the entries from ${plain(entries[1])}` : '');

  if (/\bCOUNT\s*\(/i.test(text)) {
    if (dynamicPredicate) {
      notes.push(runtimeNote('which records these are', where ? where[1].trim() : '', statements));
    }
    return {
      anchors,
      core: `The number of ${entity ? entity.plural : 'records'}${restriction} is determined.`,
      notes,
      tag: 'select',
    };
  }

  if (/\bWITH\s+PRIVILEGED\s+ACCESS\b/i.test(text)) {
    notes.push('The access control of the entity is bypassed.');
  }
  if (/\bCLIENT\s+SPECIFIED\b/i.test(text)) {
    notes.push('The client restriction is stated explicitly in the predicate, not applied automatically.');
  }
  if (dynamicPredicate) {
    notes.push(runtimeNote('which records these are', where ? where[1].trim() : '', statements));
  }

  const list = SELECT_LIST.exec(text);
  const single = /\bSINGLE\b/i.test(text);
  if (single && list) {
    // Die alte Syntax trennt die Feldliste mit Leerzeichen, die neue mit Komma.
    // Die alte Syntax kann das INTO vor dem FROM haben; es gehört nicht zur
    // Feldliste. Ein Alias `v~feld` heißt im Satz nur `feld`.
    const columns = list[1].replace(/\s+INTO\s+.*$/i, '');
    const fields = (columns.includes(',') ? columns.split(',') : columns.split(/\s+/))
      .map((field) => field.trim().replace(/^\w+~/, ''))
      .filter((field) => field && !/^\*$/.test(field));
    // `SELECT SINGLE @abap_true …` liest kein Feld: es prüft, ob es einen Satz gibt.
    if (fields.length === 1 && (literalOf(fields[0].replace(/^@/, '')) != null || /^@?abap_true$/i.test(fields[0]))) {
      return {
        anchors,
        core: `It is checked whether there is a matching ${entity ? `${entity.singular} record` : `record in ${rawFrom ?? 'the table'}`}${restriction}.`,
        notes,
        tag: 'select',
      };
    }
    const known = fields.every((field) => isKnownField(field));
    const named = fields.map((field) => (known ? termFor(field).singular : plain(field)));
    if (named.length > 0 && named.length <= 3) {
      // F12: ein unbekanntes Feld bekommt kein erratenes Geschlecht; es heißt
      // „das Feld …", und die Tabelle steht mit Namen da statt „des Satzes".
      const owner = entity ? genitivePhrase(entity) : `from ${rawFrom ?? 'the table'}`;
      const core = known && entity
        ? `${named.length === 1 ? capitalize(nounPhrase(fields[0])) : `The ${enumerate(named)}`} ${genitivePhrase(entity)}${restriction} ${named.length > 1 ? 'are' : 'is'} read.`
        : known && named.length === 1
          ? `${capitalize(nounPhrase(fields[0]))} ${owner}${restriction} is read.`
          : named.length > 1
          ? `The fields ${enumerate(named)} ${owner}${restriction} are read.`
          : `The field ${named[0]} ${owner}${restriction} is read.`;
      return { anchors, core, notes, tag: 'select' };
    }
  }

  return { anchors, core: `${capitalizeWord(subject)}${restriction} are selected.`, notes, tag: 'select' };
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
  const columns = list[1].replace(/\s+INTO\s+.*$/i, '');
  const fields = (columns.includes(',') ? columns.split(',') : columns.split(/\s+/))
    .map((field) => field.trim().replace(/\s+AS\s+\w+$/i, ''))
    .filter((field) => field && field !== '*' && !/^AS$/i.test(field));
  if (fields.length < 2 || fields.length > 6) return null;
  const named = fields.map((field) => (isKnownField(field) ? termFor(field).singular : plain(field).replace(/^\w+~/, '')));
  return {
    anchors: [range(statement)],
    core: `The result contains ${enumerate(named)}.`,
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

/**
 * Der Satzanfang zu einem Kennzeichen (`= 'X'`): „Wenn das Feld gv_flag
 * gesetzt ist, wird …".
 *
 * Ein Nebensatz mit `nounPhrase`, kein „Mit gesetztem gv_flag": die Endung
 * von „gesetztem" rät ein Geschlecht, das für einen unbekannten Bezeichner
 * niemand festgelegt hat (F12, QA 594357222bd7). `nounPhrase` nimmt das
 * Geschlecht aus dem Glossar, wo es eines führt, und sonst „das Feld …" —
 * dann trägt das Wort „Feld" den Artikel, nicht der Bezeichner.
 */
function flagLead(identifier: string, set: boolean): Lead {
  return lead(`If ${nounPhrase(identifier)} is ${set ? '' : 'not '}set`, true);
}

/** „Ohne Treffer wird X" oder „Ist die Sperre nicht zu erhalten, wird X". */
function compose(subject: Lead, rest: string): string {
  return `${subject.text}, ${rest}`;
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
    lead(`With a return code other than ${value}`),
    lead(`With return code ${value}`),
    `the return code (sy-subrc) is not ${value}`,
    `the return code (sy-subrc) is ${value}`,
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
  // Ein CALL TRANSACTION ohne Bilddaten ist ein Dialogaufruf — ob dort
  // geschrieben wird, entscheidet der Benutzer, nicht dieser Code (F4).
  if (/^CALL\s+TRANSACTION\b/i.test(statement.text)) return /\bUSING\b/i.test(statement.text);
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
    outcome(lead('Without a hit'), lead('With a hit'), 'there is no hit', 'there is a hit');
  if (keyword === 'SELECT' || keyword === 'LOOP' || keyword === 'FIND' || keyword === 'SEARCH') return found();
  if (keyword === 'READ' && /^READ\s+TABLE\b/i.test(text)) return found();
  if (keyword === 'READ' && /^READ\s+DATASET\b/i.test(text)) {
    return outcome(
      lead('If the end of the file is reached', true),
      lead('If a record was read', true),
      'the end of the file is reached',
      'a record was read',
    );
  }
  if (keyword === 'AUTHORITY-CHECK') {
    const object = /OBJECT\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    const name = object ? (literalOf(object[1]) ?? object[1]) : '';
    const field = /ID\s+'[^']*'\s+FIELD\s+([ps]_\w+)/i.exec(text);
    const restriction = field ? ` for the entered ${termFor(field[1]).singular}` : '';
    return outcome(
      lead(`Without authorization for ${name}${restriction}`),
      lead(`With authorization for ${name}${restriction}`),
      `the authorization for ${name} is missing`,
      `the authorization for ${name} is granted`,
    );
  }
  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) {
      const name = resolveValue(fn[1], statements, setter.index).value ?? plain(fn[1]);
      if (/^ENQUEUE_/i.test(name)) {
        return outcome(
          lead(`If the lock via ${name} cannot be obtained`, true),
          lead(`If the lock via ${name} is set`, true),
          `the lock via ${name} cannot be obtained`,
          `the lock via ${name} is set`,
        );
      }
      return outcome(
        lead(`If the call of ${name} fails`, true),
        lead(`If the call of ${name} succeeds`, true),
        `the call of ${name} fails`,
        `the call of ${name} succeeds`,
      );
    }
    const transaction = /^CALL\s+TRANSACTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (transaction) {
      const name = literalOf(transaction[1]) ?? transaction[1];
      return outcome(
        lead(`If transaction ${name} reports an error`, true),
        lead(`If transaction ${name} runs without errors`, true),
        `transaction ${name} reports an error`,
        `transaction ${name} runs without errors`,
      );
    }
    const method = /^CALL\s+METHOD\s+\S*?([A-Za-z0-9_]+)\s*(?:\(|$|\s)/i.exec(text);
    if (method && /\bEXCEPTIONS\b/i.test(text)) {
      return outcome(
        lead(`If the call of ${method[1]} fails`, true),
        lead(`If the call of ${method[1]} succeeds`, true),
        `the call of ${method[1]} fails`,
        `the call of ${method[1]} succeeds`,
      );
    }
    return neutralOutcome(value);
  }
  if (/->|=>/.test(text) && /\bEXCEPTIONS\b/i.test(text)) {
    const method = /(?:->|=>)([A-Za-z0-9_]+)\s*\(/.exec(text);
    if (method) {
      return outcome(
        lead(`If the call of ${method[1]} fails`, true),
        lead(`If the call of ${method[1]} succeeds`, true),
        `the call of ${method[1]} fails`,
        `the call of ${method[1]} succeeds`,
      );
    }
  }
  if (keyword === 'OPEN' && /^OPEN\s+DATASET\b/i.test(text)) {
    return outcome(
      lead('If the file cannot be opened', true),
      lead('If the file is open', true),
      'the file cannot be opened',
      'the file is open',
    );
  }
  if (['INSERT', 'UPDATE', 'MODIFY', 'DELETE'].includes(keyword)) {
    const what = writesInternally(setter, internalTables(statements)) ? 'the table change' : 'the database change';
    return outcome(
      lead(`If ${what} fails`, true),
      lead(`If ${what} succeeds`, true),
      `${what} fails`,
      `${what} succeeds`,
    );
  }
  if (keyword === 'RECEIVE') {
    return outcome(
      lead('If the response of the parallel task fails', true),
      lead('If the response of the parallel task is available', true),
      'the response of the parallel task fails',
      'the response of the parallel task is available',
    );
  }
  if (keyword === 'CATCH') {
    return outcome(
      lead('If an exception occurred', true),
      lead('If no exception occurred', true),
      'an exception occurred',
      'no exception occurred',
    );
  }
  if (keyword === 'EXEC' || keyword === 'ENDEXEC') {
    return outcome(
      lead('If the Native SQL statement fails', true),
      lead('If the Native SQL statement succeeds', true),
      'the Native SQL statement fails',
      'the Native SQL statement succeeds',
    );
  }
  if (keyword === 'ASSIGN') {
    return outcome(
      lead('If the field cannot be assigned', true),
      lead('If the field is assigned', true),
      'the field cannot be assigned',
      'the field is assigned',
    );
  }
  if (keyword === 'GET' && /^GET\s+PARAMETER\b/i.test(text)) {
    return outcome(
      lead('If the user parameter is not set', true),
      lead('If the user parameter is set', true),
      'the user parameter is not set',
      'the user parameter is set',
    );
  }
  if (keyword === 'COMMIT' && /\bAND\s+WAIT\b/i.test(text)) {
    return outcome(
      lead('If the update task fails', true),
      lead('If the update task succeeds', true),
      'the update task fails',
      'the update task succeeds',
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
    const copy = subrcCopyBefore(statements, index, variable);
    if (copy === null) return neutralOutcome(value);
    from = copy;
  }
  return outcomeOf(subrcSetter(statements, from), statements, value);
}

/**
 * Die Kopie `variable = sy-subrc`, deren Wert an der Stelle `index` noch in
 * `variable` steht — ihr Index, oder `null`.
 *
 * Rückwärts bis zur letzten Anweisung, die `variable` schreibt. Ist das die
 * Kopie, trägt die Variable das `sy-subrc` ihrer setzenden Anweisung. Ist es
 * etwas anderes — `lv_rc = 4`, `CLEAR lv_rc`, `… INTO lv_rc`, ein
 * `IMPORTING … = lv_rc` —, hält sie etwas anderes, und „Ohne Berechtigung"
 * wäre geraten (QA 23c5c0362148). Eine Kopie in einem inneren Block (`IF …
 * lv_rc = sy-subrc. ENDIF.`) ist vielleicht nie gelaufen und zählt ebenso
 * wenig; der Anfang der Routine beendet die Suche.
 */
function subrcCopyBefore(statements: readonly AbapStatement[], index: number, variable: string): number | null {
  const name = escapeForRegExp(variable);
  const copy = new RegExp(`^(?:DATA\\()?${name}\\)?\\s*=\\s*sy-subrc\\s*$`, 'i');
  const writes = [
    new RegExp(`^(?:DATA\\()?${name}\\)?\\s*(?:[-+*/]|&&)?=(?!=)`, 'i'),
    new RegExp(`^(?:CLEAR|FREE|REFRESH)\\b[^.]*\\b${name}\\b`, 'i'),
    new RegExp(`\\b(?:TO|INTO)\\s+(?:@?DATA\\()?@?${name}\\b`, 'i'),
    new RegExp(`\\b(?:IMPORTING|CHANGING|RECEIVING)\\b[\\s\\S]*=\\s*(?:DATA\\()?${name}\\b`, 'i'),
  ];
  let depth = 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const statement = statements[i];
    const keyword = statement.keyword.toUpperCase();
    if (/^(?:FORM|METHOD|FUNCTION|MODULE)$/.test(keyword) || isEvent(statement)) return null;
    // Ein Nachbarzweig (`ELSE`, `WHEN` …) läuft nicht vor diesem, sondern
    // statt seiner: weiter vor dem Kopf des ganzen Blocks.
    // Ein `CATCH` kommt aus einem Versuch, der irgendwo abgebrochen ist: was
    // davor in der Variablen steht, sagt der Code nicht.
    if (depth === 0 && /^(?:CATCH|CLEANUP)$/.test(keyword)) return null;
    if (depth === 0 && /^(?:ELSE|ELSEIF|WHEN)$/.test(keyword)) {
      let nested = 0;
      let j = i - 1;
      for (; j >= 0; j -= 1) {
        const k = statements[j].keyword.toUpperCase();
        if (/^(?:ENDIF|ENDCASE)$/.test(k)) nested += 1;
        else if (/^(?:IF|CASE)$/.test(k)) {
          if (nested === 0) break;
          nested -= 1;
        }
      }
      if (j < 0) return null;
      i = j;
      continue;
    }
    const loopSelect = keyword === 'SELECT' && !/\bSINGLE\b|\bTABLE\b/i.test(statement.text);
    if (CLOSERS.has(keyword)) depth += 1;
    else if (depth > 0 && (OPENERS[keyword] !== undefined || loopSelect)) depth -= 1;
    if (copy.test(statement.text)) return depth === 0 ? i : null;
    if (writes.some((pattern) => pattern.test(statement.text))) return null;
  }
  return null;
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
function lastWriteIsSelect(statements: readonly AbapStatement[], index: number, needle: string): boolean {
  const name = escapeForRegExp(needle);
  const selectInto = new RegExp(`\\b(?:INTO|APPENDING)\\s+(?:CORRESPONDING\\s+FIELDS\\s+OF\\s+)?TABLE\\s+@?(?:DATA\\()?${name}\\b`, 'i');
  // Was die Tabelle sonst füllt oder leert. Ein `CLEAR` nach dem `SELECT`
  // macht sie leer, ohne dass etwas nicht gefunden wurde.
  const otherWrite = new RegExp(
    `^(?:CLEAR|REFRESH|FREE)\\b.*\\b${name}\\b(?![\\w-])` +
      `|^${name}(?:\\[\\])?\\s*=` +
      `|^(?:APPEND|INSERT|COLLECT|MOVE)\\b.*\\b(?:TO|INTO)\\s+(?:TABLE\\s+)?${name}\\b(?![\\w-])` +
      `|^(?:DELETE|MODIFY)\\s+(?:TABLE\\s+)?${name}\\b(?![\\w-])` +
      `|\\bTABLES\\b.*\\b\\w+\\s*=\\s*${name}\\b(?![\\w-])`,
    'i',
  );
  for (let i = index - 1; i >= 0; i -= 1) {
    const other = statements[i];
    if (other.keyword.toUpperCase() === 'SELECT' && selectInto.test(other.text)) return true;
    if (otherWrite.test(other.text) || writesVariable(other.text, needle)) return false;
  }
  return false;
}

function initialLead(name: string, statements: readonly AbapStatement[], index: number, negated: boolean): Lead {
  const needle = plain(name).toLowerCase();
  const filledBySelect = lastWriteIsSelect(statements, index, needle);
  if (INTERNAL_TABLE.test(name) || internalTables(statements).has(needle)) {
    if (filledBySelect) return lead(negated ? 'With hits' : 'Without a hit');
    return lead(negated ? `If table ${plain(name)} contains rows` : `If table ${plain(name)} is empty`, true);
  }
  if (isKnownField(name)) {
    const word = termFor(name).singular;
    return negated ? lead(`If ${nounPhrase(name)} is not empty`, true) : lead(`Without ${indefinite(word)} ${word}`);
  }
  return lead(`If ${nounPhrase(name)} is ${negated ? 'not ' : ''}empty`, true);
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
  // Nur, solange die Kopie noch in der Variablen steht (QA 23c5c0362148).
  const compared = /^IF\s+(\S+)\s*(<>|=)\s*0\s*$/i.exec(head.text);
  const isSubrc =
    compared !== null &&
    (/^sy-subrc$/i.test(compared[1]) ||
      (/^[A-Za-z0-9_]+$/.test(compared[1]) && subrcCopyBefore(statements, index, compared[1]) !== null));
  const subrc = isSubrc ? [compared![0], compared![2]] : null;
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
      subject = flagLead(compare[1], compare[2] === '=');
    } else {
      subject = lead(`If ${conditionClause(head.text)}`, true);
    }
  } else return null;

  const anchors = [range(head), ...(write ? [range(write)] : []), range(leave)];
  const label = write ? writtenTarget(write, origins).label : null;
  const exit = guardExit(statements, index, body, leave, context);
  const core = label
    ? `${compose(subject, `${label} is output and ${exit}`)}.`
    : `${compose(subject, exit)}.`;
  return { anchors, core, grain: 'group', tag: 'guard', exit, subject };
}

/** Ereignisse, die in einem Programmlauf genau einmal laufen. */
const ONCE_EVENT = /^(?:START-OF-SELECTION|END-OF-SELECTION|INITIALIZATION|LOAD-OF-PROGRAM)\.?$/i;

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
  // Eine Methode nur, wenn feststeht, dass der Aufruf die lokale
  // Implementierung meint (QA b7e191a72212) — sonst kann ein fremdes
  // `lo_external->save( )` festschreiben, und „kein COMMIT WORK" wäre falsch.
  const explicit = /^CALL\s+METHOD\s+(?:(\S*?)(->|=>))?([A-Za-z0-9_]+)(?:\s|$|\()/i.exec(text);
  if (explicit) {
    return methodImplementation(statements, explicit[1] ?? '', (explicit[2] as '->' | '=>' | undefined) ?? null, explicit[3], statement.index) !== null;
  }
  const method = /([A-Za-z0-9_/<>]+)(->|=>)([A-Za-z0-9_]+)\s*\(/.exec(text);
  if (method) return methodImplementation(statements, method[1], method[2] as '->' | '=>', method[3], statement.index) !== null;
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

/** Die Klassen des Quelltexts, einmal je Quelle gelesen: Methoden, Oberklassen, Referenztypen. */
interface LocalClasses {
  model: ClassModel;
  heads: Map<string, AbapStatement>;
  /** Die Klasse, in deren `IMPLEMENTATION` eine Anweisung steht — je Index. */
  ownClass: (string | null)[];
}

const CLASS_CACHE = new WeakMap<readonly AbapStatement[], LocalClasses>();

/** Die Klasse der Methoden, die ohne `CLASS … IMPLEMENTATION` im Ausschnitt stehen. Kein ABAP-Name. */
const UNNAMED_CLASS = '(AUSSCHNITT)';

function localClasses(statements: readonly AbapStatement[]): LocalClasses {
  const cached = CLASS_CACHE.get(statements);
  if (cached) return cached;
  const impls: MethodTarget[] = [];
  const heads = new Map<string, AbapStatement>();
  const superOf = new Map<string, string>();
  const ownClass: (string | null)[] = [];
  let current: string | null = null;
  // Methoden ohne umgebendes `CLASS … IMPLEMENTATION` — ein Web-Dynpro-
  // Controller, eine aus dem Class Builder kopierte Klasse — gehören zu einer
  // Klasse, die der Ausschnitt nicht nennt, aber zu **einer**: der, in der sie
  // alle stehen.
  let loose = false;
  for (const statement of statements) {
    const keyword = statement.keyword.toUpperCase();
    const opener = /^CLASS\s+([A-Za-z0-9_/]+)\s+(DEFINITION|IMPLEMENTATION)\b/i.exec(statement.text);
    if (opener) {
      const parent = /\bINHERITING\s+FROM\s+([A-Za-z0-9_/]+)/i.exec(statement.text);
      if (parent) superOf.set(opener[1].toUpperCase(), parent[1].toUpperCase());
      // `CLASS x DEFINITION DEFERRED.` öffnet nichts.
      if (opener[2].toUpperCase() === 'IMPLEMENTATION') current = opener[1].toUpperCase();
    } else if (keyword === 'ENDCLASS') current = null;
    else if (keyword === 'METHOD' && current === null) loose = true;
    const cls = current ?? (loose ? UNNAMED_CLASS : null);
    ownClass[statement.index] = cls;
    if (keyword === 'ENDMETHOD') loose = false;
    if (cls && keyword === 'METHOD') {
      const name = /^METHOD\s+([A-Za-z0-9_/~]+)/i.exec(statement.text)?.[1]?.toUpperCase();
      const key = name ? `${cls}=>${name}` : null;
      if (name && key && !heads.has(key)) {
        const tilde = name.lastIndexOf('~');
        impls.push({ key, cls, name, short: tilde < 0 ? name : name.slice(tilde + 1) });
        heads.set(key, statement);
      }
    }
  }
  const classes = { model: { impls, superOf, refTypes: readReferenceTypes(statements) }, heads, ownClass };
  CLASS_CACHE.set(statements, classes);
  return classes;
}

/**
 * Die Implementierung einer aufgerufenen Methode im gelieferten Code — oder
 * `null`, wenn sie dort nicht steht **oder nicht feststeht, dass sie gemeint
 * ist**.
 *
 * Die Auflösung ist die des Skeletts (`method-resolution.ts`): die Klasse
 * kommt aus dem Aufruf — `klasse=>m`, `me->m`, `super->m`, oder `lo->m` mit
 * dem Typ, mit dem `lo` deklariert ist —, dann die Vererbungskette hinauf.
 * Anders als das Skelett entscheidet der Name hier nie allein: ein
 * `lo_external->save( )` auf einem Objekt, dessen Klasse der Ausschnitt nicht
 * nennt, ist nicht die lokale Methode `save`, die zufällig gleich heißt, und
 * bekommt deren Wirkung nicht zugeschrieben (QA b7e191a72212).
 *
 * `owner` ist, was vor dem letzten Pfeil steht; eine Kette `lo->mo_sub->m`
 * wird am letzten Glied gelesen.
 */
function methodImplementation(
  statements: readonly AbapStatement[],
  owner: string,
  op: '->' | '=>' | null,
  name: string,
  at: number,
): AbapStatement | null {
  return resolveCall(statements, owner, op, name, at).head;
}

function resolveCall(
  statements: readonly AbapStatement[],
  owner: string,
  op: '->' | '=>' | null,
  name: string,
  at: number,
): { head: AbapStatement | null; note: string | null } {
  const classes = localClasses(statements);
  const segments = owner.split(/->|=>/);
  const last = segments[segments.length - 1] ?? '';
  // `wd_this` ist im Web Dynpro der Controller selbst — wie `me`.
  const self = /^wd_this$/i.test(last) ? 'me' : last;
  const qualifier = op === null ? null : /^[A-Za-z0-9_/]+$/.test(self) ? self : ')';
  const { key, byClass } = resolveMethodTarget(classes.model, qualifier, op, name, classes.ownClass[at] ?? null, {
    byNameAlone: false,
  });
  const head = key ? classes.heads.get(key) ?? null : null;
  if (head) return { head, note: null };
  // Steht die Klasse nicht fest, der Ausschnitt implementiert aber eine
  // gleichnamige Methode, ist das Verhalten nicht „nicht belegt" — es ist nur
  // offen, welche Implementierung läuft (eine Referenz mit zwei Typen, ein
  // Objekt ohne Deklaration im Ausschnitt).
  const wanted = name.toUpperCase();
  const namesake = !byClass && classes.model.impls.some((impl) => impl.name === wanted || impl.short === wanted);
  return {
    head: null,
    note: namesake
      ? `Which implementation of ${name} runs here is not settled by the supplied code at this point.`
      : 'Its business behaviour is not evidenced in the supplied code.',
  };
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
    if (keyword === 'COMMIT' && /^COMMIT\s+WORK\b/i.test(text)) commits.push('commits with COMMIT WORK');
    else if (/^CALL\s+FUNCTION\s+'BAPI_TRANSACTION_COMMIT'/i.test(text)) commits.push('commits with BAPI_TRANSACTION_COMMIT');
    else if (/^CALL\s+FUNCTION\s+'([^']+)'/i.test(text)) {
      const fn = /^CALL\s+FUNCTION\s+'([^']+)'/i.exec(text)![1];
      functions.push(/\bIN\s+UPDATE\s+TASK\b/i.test(text) ? `${fn} (in the update task)` : fn);
    } else if (/^CALL\s+TRANSACTION\s+'([^']+)'/i.test(text)) {
      others.push(`calls transaction ${/^CALL\s+TRANSACTION\s+'([^']+)'/i.exec(text)![1]}`);
    } else if (['UPDATE', 'INSERT', 'MODIFY', 'DELETE'].includes(keyword) && isDbWrite(statement, tables)) {
      const target = /^(?:UPDATE|MODIFY|INSERT\s+INTO|INSERT|DELETE\s+FROM|DELETE)\s+([A-Za-z0-9_/]+)/i.exec(text);
      if (target) {
        const verb =
          keyword === 'UPDATE' ? 'changes' : keyword === 'INSERT' ? 'creates records in' : keyword === 'DELETE' ? 'deletes from' : 'writes to';
        writes.push(`${verb} ${nameOf(target[1])}`);
      }
    } else if (keyword === 'SELECT') {
      const from = /\bFROM\s+([A-Za-z0-9_/]+)/i.exec(text);
      if (from) reads.push(nameOf(from[1]));
    } else if (keyword === 'MESSAGE' && !/\bINTO\b/i.test(text)) others.push('outputs a message');
    else if (isOutputWrite(statement)) others.push('outputs list lines');
    else if (keyword === 'RAISE' && /^RAISE\s+EVENT\s+([A-Za-z0-9_]+)/i.test(text)) {
      others.push(`raises the event ${/^RAISE\s+EVENT\s+([A-Za-z0-9_]+)/i.exec(text)![1]}`);
    }
  }
  const unique = (items: string[]) => items.filter((item, index) => items.indexOf(item) === index);
  const effects = [
    ...unique(writes),
    ...(functions.length > 0 ? [`calls ${enumerate(unique(functions).slice(0, 3))}`] : []),
    ...unique(commits),
    ...(reads.length > 0 ? [`reads ${enumerate(unique(reads).slice(0, 3))}`] : []),
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
 * geschrieben" ist eine Aussage über den **ganzen Weg** bis zum Rücksprung,
 * und die Quellreihenfolge trägt sie nur dort, wo sie die
 * Ausführungsreihenfolge ist. Also nur, wenn
 *
 * - der Rücksprung ein einmal laufendes Ereignis verlässt (START-OF-SELECTION,
 *   INITIALIZATION …, oder den Code eines Programms ohne Ereignis): eine
 *   Routine oder ein Include ohne REPORT kehrt zum Aufrufer zurück, und der
 *   macht weiter; `AT USER-COMMAND`, `AT SELECTION-SCREEN` oder ein `GET` laufen
 *   mehrfach, und ein früherer Durchlauf kann hinter dem Wächter geschrieben
 *   haben;
 * - der Wächter in keiner Schleife steht — sonst hat ein früherer Durchlauf
 *   die Anweisung hinter ihm schon ausgeführt (QA d7a7d3a66683);
 * - der Wächter selbst nichts aufruft und vor ihm in der Einheit weder
 *   geschrieben noch etwas aufgerufen wird — ein `PERFORM protokoll` davor
 *   kann schreiben;
 * - kein anderes Ereignis, vor **oder** hinter der Einheit in der Quelle,
 *   schreibt oder etwas aufruft: ein `INITIALIZATION` mit DELETE davor hat
 *   geschrieben, bevor der Wächter überhaupt läuft.
 *
 * Fehlt eine Bedingung, bleibt es bei „vor der Datenbankoperation
 * zurückgekehrt" — lieber die Aussage weglassen als sie falsch machen. Genau
 * das haben die Richter an einem `log_sichern` mit COMMIT WORK dahinter
 * gefunden.
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
  if (keyword === 'EXIT' && innermost?.kind === 'loop') return 'the loop is exited';
  if (keyword === 'LEAVE') return leavePhrase(leave) ?? 'the block is exited';
  const unit = processingUnit(statements, stack, leave.index);
  const writesLater = statements.slice(leave.index + 1, unit.end).some((next) => isDbWrite(next, context.tables));
  if (!writesLater) return 'the block is exited';
  // Ein Sperrbaustein (`ENQUEUE_…`/`DEQUEUE_…`) setzt eine Sperre, er schreibt
  // keine Datenbankzeile.
  const lockOnly = (statement: AbapStatement) =>
    /^CALL\s+FUNCTION\s+'(?:ENQUEUE|DEQUEUE)_[A-Za-z0-9_/]+'/i.test(statement.text) &&
    !/\bIN\s+UPDATE\s+TASK\b|\bDESTINATION\b/i.test(statement.text);
  const acts = (statement: AbapStatement) =>
    (callsOut(statement) && !lockOnly(statement)) ||
    isDbWrite(statement, context.tables) ||
    /^CREATE\s+OBJECT\b|\bNEW\s+[A-Za-z0-9_/]+\s*\(/i.test(statement.text);
  // Ohne Ereignis ist der Code nur dann das implizite START-OF-SELECTION, wenn
  // er ein Programm ist; ein Include oder Exit ohne REPORT kehrt zu einem
  // Aufrufer zurück, der weitermacht.
  const onceOnly =
    (unit.kind === 'unknown' && statements.some((other) => /^(?:REPORT|PROGRAM)$/i.test(other.keyword))) ||
    (unit.kind === 'event' && ONCE_EVENT.test(statements[unit.start].text.trim()));
  const quiet =
    onceOnly &&
    !stack.some((block) => block.kind === 'loop') &&
    !body.some(acts) &&
    !statements.slice(unit.start, index).some(acts) &&
    ![...statements.slice(0, unit.start), ...statements.slice(unit.end)].some(
      (statement) =>
        !context.stacks[statement.index].some((block) => block.kind === 'routine' || block.kind === 'class') &&
        !/^(?:FORM|CLASS|METHOD|MODULE|FUNCTION)$/i.test(statement.keyword) &&
        acts(statement),
    );
  return quiet
    ? 'processing returns before the database operation; nothing is written'
    : 'processing returns before the database operation';
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
  if (screen) return screen[1] === '0' ? 'the screen sequence is ended' : `processing moves to screen ${plain(screen[1])}`;
  if (/^LEAVE\s+SCREEN$/i.test(text)) return 'the current screen is exited';
  if (/^LEAVE\s+LIST-PROCESSING$/i.test(text)) return 'list processing is exited';
  if (/^LEAVE\s+TO\s+LIST-PROCESSING\b/i.test(text)) return 'processing switches to list processing';
  if (/^LEAVE\s+PROGRAM$/i.test(text)) return 'the program is ended';
  const transaction = /^LEAVE\s+TO\s+(?:CURRENT\s+)?TRANSACTION\s*('[^']*'|\S+)?/i.exec(text);
  if (transaction) {
    return transaction[1]
      ? `the program is exited and transaction ${literalOf(transaction[1]) ?? plain(transaction[1])} is started`
      : 'the program is exited and the current transaction is restarted';
  }
  return null;
}

/** Der ganze Satz zu einem `LEAVE`. */
function leaveSentence(statement: AbapStatement, statements: readonly AbapStatement[]): string {
  const text = statement.text.trim();
  if (/^LEAVE\s+TO\s+SCREEN\s+0$/i.test(text)) return 'The screen sequence is ended.';
  const screen = /^LEAVE\s+TO\s+SCREEN\s+(\S+)$/i.exec(text);
  if (screen) return `Processing continues with screen ${plain(screen[1])}.`;
  if (/^LEAVE\s+SCREEN$/i.test(text)) {
    const set = statements
      .slice(Math.max(0, statement.index - 2), statement.index)
      .map((other) => /^SET\s+SCREEN\s+(\S+)$/i.exec(other.text))
      .find(Boolean);
    if (set && set[1] === '0') return 'The screen sequence is ended.';
    return set ? `Processing continues with screen ${plain(set[1])}.` : 'The current screen is exited; the configured next screen follows.';
  }
  if (/^LEAVE\s+LIST-PROCESSING$/i.test(text)) {
    return 'List processing is exited; processing returns to the screen it started from.';
  }
  if (/^LEAVE\s+TO\s+LIST-PROCESSING\b/i.test(text)) return 'Processing switches to list processing.';
  if (/^LEAVE\s+PROGRAM$/i.test(text)) return 'The program is ended.';
  const transaction = /^LEAVE\s+TO\s+(?:CURRENT\s+)?TRANSACTION\s*('[^']*'|\S+)?/i.exec(text);
  if (transaction) {
    return transaction[1]
      ? `The program is exited and transaction ${literalOf(transaction[1]) ?? plain(transaction[1])} is started.`
      : 'The program is exited and the current transaction is restarted.';
  }
  return 'The current processing is exited.';
}

/** Eine Zuweisung in einem Zweig: „Negative Beträge setzen die Route auf INVALID." */
function branchAssignment(statement: AbapStatement, stack: Block[], statements: readonly AbapStatement[]): Draft | null {
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(statement.text);
  if (!assign) return null;
  const branch = [...stack].reverse().find((block) => block.kind === 'if' || block.kind === 'elseif' || block.kind === 'else');
  if (!branch) return null;
  const value = literalOf(assign[2]) ?? assign[2];
  // F12: „Negative Beträge setzen die Route" ist ein Satz mit Mehrzahl-
  // Subjekt; „Eine leere lv_msgno setzen die Status" war keiner. Nur ein
  // Vergleich über ein bekanntes Fachwort bleibt Subjekt, sonst trägt ein
  // Bedingungssatz die Aussage, und der Bezeichner bekommt keinen erratenen
  // Artikel („das Feld …").
  const plural =
    branch.kind === 'else'
      ? elseSubject(branch.previous) === 'Otherwise' ? null : elseSubject(branch.previous)
      : pluralSubject(branch.head.text);
  // Ein `rv_`/`cv_`/`ev_` ist das Ergebnis der Routine selbst: der Fall
  // *erhält* diesen Wert. Eine gewöhnliche Variable wird dagegen *gesetzt*.
  const returning = /^(rv_|cv_|ev_)/i.test(assign[1].trim());
  let core: string;
  if (plural) {
    core = returning ? `${plural} receive ${value}.` : `${plural} set ${nounPhrase(assign[1])} to ${value}.`;
  } else {
    const subject =
      branch.kind === 'else'
        ? lead('Otherwise')
        : lead(`If ${conditionClause(branch.head.text, subrcClauseAt(statements, branch.head.index))}`, true);
    core = `${compose(subject, `${nounPhrase(assign[1])} is set to ${value}`)}.`;
  }
  return { anchors: [range(statement), range(branch.head)], core, grain: 'group', tag: 'branch' };
}

/** Eine Zuweisung ohne Zweig: „Die Review-Markierung wird auf N gesetzt." */
function plainAssignment(statement: AbapStatement, statements: readonly AbapStatement[], stack: Block[]): Draft | null {
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(statement.text);
  if (!assign) return null;
  const value = literalOf(assign[2]) ?? assign[2];
  // Der RETURNING-Parameter einer Methode ist ihr Ergebnis, kein Feld mit
  // eigener Bedeutung: `text = 'x'` in `METHOD tick` heißt „tick gibt x
  // zurück", nicht „der Text wird auf x gesetzt".
  const method = [...stack].reverse().find((block) => block.kind === 'routine' && /^METHOD$/i.test(block.head.keyword));
  if (method) {
    const methodName = /^METHOD\s+(?:\S+~)?([A-Za-z0-9_]+)/i.exec(method.head.text)?.[1] ?? '';
    const target = plain(assign[1]).toLowerCase();
    const returning = statements.some((other) => {
      const declaration = /^(?:CLASS-)?METHODS\s+([A-Za-z0-9_]+)\b.*\bRETURNING\s+VALUE\(\s*([A-Za-z0-9_]+)\s*\)/i.exec(other.text);
      return declaration !== null && declaration[1].toLowerCase() === methodName.toLowerCase() && declaration[2].toLowerCase() === target;
    });
    if (returning) {
      return { anchors: [range(statement)], core: `The method ${methodName} returns the value ${value}.`, tag: 'set' };
    }
  }
  return {
    anchors: [range(statement)],
    core: `${capitalize(nounPhrase(plain(assign[1])))} is set to ${value}.`,
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
  const notes = ['Nothing is changed at the call site.'];
  if (!registration) return notes;
  const lines = (state: 'dispatched' | 'discarded') =>
    registration.outcomes.filter((o) => o.state === state).map((o) => o.lineStart).join(' or ');
  const dispatched = lines('dispatched');
  const discarded = lines('discarded');
  if (dispatched) notes.push(`It is only triggered by the COMMIT WORK in line ${dispatched}.`);
  if (discarded) notes.push(`The ROLLBACK WORK in line ${discarded} discards the registration.`);
  if (registration.unresolved?.state === 'orphaned') {
    notes.push(dispatched
      ? 'On the path without COMMIT WORK, it is neither triggered nor executed.'
      : 'No COMMIT WORK follows in the supplied program: it is neither triggered nor executed.');
  } else if (registration.unresolved) {
    notes.push('Whether a COMMIT WORK triggers it on every path is not determined in the supplied code.');
  }
  return notes;
}

// ---------------------------------------------------------------------------
// MESSAGE (F5)
// ---------------------------------------------------------------------------

const MESSAGE_TYPES: Record<string, { noun: string; article: string }> = {
  A: { noun: 'termination message', article: 'a' },
  E: { noun: 'error message', article: 'an' },
  W: { noun: 'warning', article: 'a' },
  I: { noun: 'information message', article: 'an' },
  S: { noun: 'status message', article: 'a' },
  X: { noun: 'message of type X', article: 'a' },
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
    label = literal != null ? `"${literal}"` : plain(first);
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
    return `The message text${label} is placed in ${parts.into}; nothing is displayed.`;
  }
  const kind = parts.type ? MESSAGE_TYPES[parts.type] : undefined;
  if (parts.raising) {
    return `The exception ${parts.raising} is raised; the message${label} appears only if the caller does not handle the exception.`;
  }
  const noun = kind ? kind.noun : 'message';
  const like = parts.displayLike && MESSAGE_TYPES[parts.displayLike] && parts.displayLike !== parts.type
    ? `, displayed like ${MESSAGE_TYPES[parts.displayLike].article} ${MESSAGE_TYPES[parts.displayLike].noun}`
    : '';
  const consequence =
    parts.type === 'A'
      ? '; the program is terminated'
      : parts.type === 'X'
        ? '; the program terminates with a runtime error'
        : '';
  return `The ${noun}${label} is output${like}${consequence}.`;
}

/** Derselbe Inhalt als Satzteil für Zweige und Folgen. */
function messageFragment(text: string): string {
  const parts = messageParts(text);
  if (parts.into) return `the message text is placed in ${parts.into}`;
  if (parts.raising) return `the exception ${parts.raising} is raised`;
  const kind = parts.type ? MESSAGE_TYPES[parts.type] : undefined;
  return kind ? `${kind.article} ${kind.noun} is output` : 'a message is output';
}

/** Was übersprungen wird, wenn ein CHECK mit diesem Vergleich in einer Schleife steht. */
const CHECK_COMPLEMENT: Record<string, string> = {
  '>=': 'smaller ones',
  GE: 'smaller ones',
  '>': 'smaller and equal ones',
  GT: 'smaller and equal ones',
  '<=': 'greater ones',
  LE: 'greater ones',
  '<': 'greater and equal ones',
  LT: 'greater and equal ones',
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
    return `Only ${lowerFirst(subject)} go on; ${complement} are skipped, and the loop continues.`;
  }
  const clause = conditionClause(condition, subrc);
  if (unit.kind === 'loop') {
    return `The loop pass continues only if ${clause}; otherwise it is skipped, and the loop continues with the next pass.`;
  }
  return `Processing continues only if ${clause}; otherwise ${unitLabel(unit)} is exited at this point.`;
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
      return { anchors, core: `The text ${resolvedText.value} is output.`, tag: 'write' };
    }
    const { label, literal } = writtenTarget(statement, origins);
    // Ein ausgegebenes Literal ist **kein** Erfolgsnachweis: es belegt, dass
    // diese Stelle erreicht wurde, und nichts sonst. Das steht als Vorbehalt
    // am Satz, weil es aus dem Code folgt und nicht aus Vorsicht.
    const notes = literal ? ['The output only proves that this point in the code was reached.'] : [];
    return { anchors, core: `${startSentence(label)} is output.`, notes, tag: 'write' };
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
      notes.push('Announced, not persisted: the change sits in the transactional buffer; the supplied code contains no COMMIT ENTITIES.');
    } else if (!rap && !committed && program && !opaque) {
      notes.push('The supplied code contains no COMMIT WORK.');
    }
    if (!rest.some((other) => /\bsy-subrc\b/i.test(other.text))) {
      notes.push('sy-subrc is not evaluated afterwards.');
    }
    return notes;
  };

  if (keyword === 'UPDATE') {
    const target = /^UPDATE\s+(\([^)]+\)|[A-Za-z0-9_/]+)/i.exec(text);
    const raw = target ? plain(target[1]) : null;
    const entity = raw ? tableTerm(raw) : null;
    const set = /\bSET\s+(\S+)\s*=/i.exec(text);
    const field = set ? capitalize(nounPhrase(set[1])) : null;
    const keyed = /\bWHERE\s+\S+\s*=\s*@?[ps]_/i.test(text);
    const core = field
      ? `${field} ${entity ? (keyed ? genitivePhrase(entity).replace(/^of the /, 'of the specified ') : genitivePhrase(entity)) : `in ${raw}`} is changed.`
      : `A row ${entity ? `of the ${entity.plural}` : `in ${raw}`} is changed.`;
    return {
      anchors,
      core,
      notes: ['The code does not guarantee that a row is hit.', ...persistenceNotes()],
      tag: 'update',
    };
  }

  if (keyword === 'MODIFY' && /^MODIFY\s+SCREEN\b/i.test(text)) {
    return { anchors, core: 'The changed attributes of the screen element are applied.', tag: 'modify' };
  }
  if (keyword === 'MODIFY' && writesInternally(statement, internalTables(statements))) {
    const target = /^MODIFY\s+(?:TABLE\s+)?([A-Za-z0-9_\-<>~]+)/i.exec(text);
    return {
      anchors,
      core: `A row of the internal table ${target ? plain(target[1]) : ''} is changed; nothing is written to the database.`.replace(/\s+;/, ';'),
      tag: 'modify',
    };
  }
  if (keyword === 'MODIFY') {
    const target = /^MODIFY\s+(?:ENTITIES\s+OF\s+)?(\([^)]+\)|[A-Za-z0-9_/]+)/i.exec(text);
    const raw = target ? plain(target[1]) : null;
    const entity = raw ? tableTerm(raw) : null;
    return {
      anchors,
      core: `A row ${entity ? `of the ${entity.plural}` : `in ${raw}`} is inserted or overwritten.`,
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
        ? (event.subrcRead ? [] : ['With AND WAIT, the code waits for the update task; sy-subrc is not evaluated afterwards, though.'])
        : ['Without AND WAIT, the code does not wait for the result of the update task; that anything was executed or persisted is therefore not proven.'];
      return {
        anchors,
        core: 'COMMIT WORK triggers the update task for the previously registered function modules.',
        notes,
        tag: 'commit',
      };
    }
    return { anchors, core: 'COMMIT WORK persists the change.', tag: 'commit' };
  }
  if (keyword === 'ROLLBACK') {
    if (event && event.registrations.length > 0) {
      return {
        anchors,
        core: 'ROLLBACK WORK discards the previously registered updates; the function module is not executed on this path.',
        tag: 'rollback',
      };
    }
    return { anchors, core: 'ROLLBACK WORK discards the changes not yet committed.', tag: 'rollback' };
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
      core: `The ${external ? 'external ' : ''}subroutine ${name ? plain(name[1]) : ''} is called${effects.length > 0 ? `; it ${enumerate(effects)}` : ''}.`.replace(/\s+/g, ' '),
      notes: head ? [] : ['Its effect is not evidenced in the supplied code.'],
      tag: 'perform',
    };
  }

  if (keyword === 'SUBMIT') {
    const name = /^SUBMIT\s+([A-Za-z0-9_/]+)/i.exec(text);
    // Mit VIA JOB läuft das Programm nicht hier, sondern wird als Schritt
    // eines Hintergrundjobs eingeplant; gestartet wird es erst mit dem Job.
    const job = /\bVIA\s+JOB\s+('[^']*'|\S+)/i.exec(text);
    if (job) {
      return {
        anchors,
        core: `The program ${name ? name[1] : ''} is scheduled as a step of the background job ${literalOf(job[1]) ?? plain(job[1])}.`.replace(/\s+/g, ' '),
        notes: ['What the program does in the job is not part of this statement.'],
        tag: 'submit',
      };
    }
    return {
      anchors,
      core: `The child program ${name ? name[1] : ''} is started.`.replace(/\s+/g, ' '),
      notes: ['What the child program does is not part of this statement.'],
      tag: 'submit',
    };
  }

  if (keyword === 'INCLUDE') {
    const name = /^INCLUDE\s+([A-Za-z0-9_/]+)/i.exec(text);
    return {
      anchors,
      core: `The report needs the include ${name ? name[1] : ''}.`.replace(/\s+/g, ' '),
      notes: ['It is not contained in the supplied excerpt.'],
      tag: 'include',
    };
  }

  if (keyword === 'AUTHORITY-CHECK') {
    const object = /OBJECT\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    const name = object ? (literalOf(object[1]) ?? object[1]) : '';
    // Eine Prüfung, deren sy-subrc niemand liest, schützt nichts: der Satz
    // sagt es, statt einen Schutz nahezulegen, den der Code nicht hat.
    let evaluated = false;
    for (let i = statement.index + 1; i < statements.length; i += 1) {
      const next = statements[i];
      if (/\bsy-subrc\b/i.test(next.text)) {
        evaluated = true;
        break;
      }
      if (isEvent(next) || /^(?:END(?:FORM|METHOD|FUNCTION|MODULE)|FORM|METHOD)$/i.test(next.keyword)) break;
      if (/^(?:SELECT|READ|LOOP|CALL|AUTHORITY-CHECK|OPEN|INSERT|UPDATE|MODIFY|DELETE|ASSIGN|FIND|SEARCH|ENDLOOP|ENDSELECT|RECEIVE|COMMIT|CATCH|PERFORM)$/i.test(next.keyword)) break;
      if (/->|=>/.test(next.text)) break;
    }
    return {
      anchors,
      core: `The authorization for ${name} is checked.`,
      notes: evaluated ? [] : ['The result of the check is not evaluated; processing continues regardless.'],
      tag: 'auth',
    };
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
      core: 'If the assertion is violated, the run terminates with a runtime error (ASSERTION_FAILED).',
      tag: 'assert',
    };
  }

  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) {
      const resolved = resolveValue(fn[1], statements, statement.index);
      const name = resolved.value ?? plain(fn[1]);
      const notes: string[] = [];
      let core = `The function module ${name} is called.`;
      if (resolved.from === 'constant') {
        core = `The call target is the immutable constant ${name}.`;
      } else if (resolved.from === 'assignment') {
        core = `Exactly the function module ${name} assigned before in line ${resolved.line} is called.`;
      } else if (resolved.from === 'unresolved') {
        notes.push(runtimeNote('which function module this is', plain(fn[1]), statements));
      }
      if (/\bIN\s+UPDATE\s+TASK\b/i.test(text)) {
        core = `The function module ${name} is registered for the update task.`;
        notes.push(...registrationNotes(luw, statement.index));
      } else if (/\bSTARTING\s+NEW\s+TASK\b/i.test(text)) {
        core = `The function module ${name} is started asynchronously in a separate task.`;
        notes.push('No result is available at this point.');
      } else if (/\bDESTINATION\b/i.test(text)) {
        // F10: „benachrichtigt" und „eingegebene" standen fest im Satz. Was
        // der Code trägt: der Baustein läuft in einem entfernten System, über
        // die Destination, die hier steht.
        const destination = /\bDESTINATION\s+('[^']*'|\S+)/i.exec(text);
        const where = !destination
          ? 'a destination'
          : literalOf(destination[1]) != null
            ? `the destination ${literalOf(destination[1])}`
            : fromSelectionScreen(destination[1])
              ? 'the entered destination'
              : `the destination from ${plain(destination[1])}`;
        core = `${name} is called in a remote system via ${where}.`;
        notes.push('Which system that is and what happens there cannot be derived from the supplied code.');
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
        core = `The code passes ${exporting[0]} to ${name} and takes its output into ${importing[0]}.`;
      }
      return { anchors, core, notes, tag: 'call' };
    }
    const method = /^CALL\s+METHOD\s+(\S+)/i.exec(text);
    if (method) {
      const called = /^(?:(.*?)(->|=>))?([A-Za-z0-9_]+)$/.exec(method[1]);
      if (!called) {
        // `CALL METHOD (lv_name)` oder `obj->(lv_name)`: der Name steht erst zur Laufzeit fest.
        const receiving = /\b(?:RECEIVING|IMPORTING)\s+\w+\s*=\s*(\S+)/i.exec(text);
        return {
          anchors,
          core: receiving
            ? `The result of the method chosen at runtime is placed in ${plain(receiving[1])}.`
            : 'The method chosen at runtime is called.',
          tag: 'call',
        };
      }
      const owner = called[1] ?? '';
      const op = (called[2] as '->' | '=>' | undefined) ?? null;
      const { head, note } = resolveCall(statements, owner, op, called[3], statement.index);
      const effects = head ? routineEffects(statements, head) : [];
      return {
        anchors,
        core: `The method ${called[3]}${owner ? ` of ${owner}` : ''} is called${effects.length > 0 ? `; it ${enumerate(effects)}` : ''}.`,
        notes: note ? [note] : [],
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
        using ? 'via batch input' : '',
        modeValue ? (/^[AENP]$/i.test(modeValue) ? `in mode ${modeValue.toUpperCase()}` : `in the mode from ${modeValue}`) : '',
      ].filter(Boolean);
      const updateValue = update ? (literalOf(update[1]) ?? plain(update[1])).toUpperCase() : null;
      const booking =
        updateValue === 'S'
          ? ' and updated synchronously'
          : updateValue === 'A'
            ? ' and updated asynchronously'
            : updateValue === 'L'
              ? ' and updated locally'
              : '';
      const after: string[] = [];
      if (/\bAND\s+SKIP\s+FIRST\s+SCREEN\b/i.test(text)) after.push('the initial screen is skipped');
      // Mit Bilddaten stößt der Aufruf die Verarbeitung der Transaktion an;
      // ohne ist es ein Dialogaufruf. Beides sagt nichts über ihren Zweck.
      return {
        anchors,
        core: `Transaction ${name} is ${using ? 'triggered' : 'called'}${how.length > 0 ? ` ${how.join(' ')}` : ''}${booking}${after.length > 0 ? `; ${after.join(', ')}` : ''}.`,
        notes: using ? ['Whether and what is persisted is decided by the called transaction.'] : [],
        tag: 'call',
      };
    }
    const screen = /^CALL\s+SCREEN\s+(\d+)/i.exec(text);
    if (screen) {
      return { anchors, core: `The program calls a screen sequence starting at screen ${screen[1]}.`, tag: 'call' };
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
      const back = taken.length > 0 ? enumerate(taken.map((value) => nounPhrase(value))) : null;
      const takenVerb = taken.length > 1 ? 'are' : 'is';
      const core =
        given.length > 0
          ? `${capital(enumerate(given.map((value) => nounPhrase(value))))} ${given.length > 1 ? 'are' : 'is'} passed to the BAdI method ${name}${back ? `, and ${back} ${takenVerb} taken over` : ''}.`
          : `The BAdI method ${name} is called${back ? `; ${back} ${takenVerb} taken over` : ''}.`;
      return { anchors, core, tag: 'call' };
    }
    const kernel = /^CALL\s+'([^']+)'/i.exec(text);
    if (kernel) {
      return {
        anchors,
        core: `The kernel call ${kernel[1]} is executed.`,
        notes: ['The actual return value is not known from the source code.'],
        tag: 'call',
      };
    }
  }

  if (keyword === 'GET') {
    if (/^GET\s+BADI\b/i.test(text)) {
      return { anchors, core: 'The configured BAdI implementation is requested.', tag: 'get' };
    }
    // Nur `GET knoten` ist das Ereignis einer logischen Datenbank (F3). Alles
    // andere mit GET liest einen Wert aus der Laufzeitumgebung.
    const parameter = /^GET\s+PARAMETER\s+ID\s+('[^']*'|\S+)\s+FIELD\s+(\S+)/i.exec(text);
    if (parameter) {
      return {
        anchors,
        core: `The user parameter ${literalOf(parameter[1]) ?? parameter[1]} is placed in ${plain(parameter[2])}.`,
        tag: 'get',
      };
    }
    const stamp = /^GET\s+TIME\s+STAMP\s+FIELD\s+(\S+)/i.exec(text);
    if (stamp) return { anchors, core: `The current time stamp is placed in ${plain(stamp[1])}.`, tag: 'get' };
    if (/^GET\s+TIME\b/i.test(text)) {
      const field = /\bFIELD\s+(\S+)/i.exec(text);
      return {
        anchors,
        core: field
          ? `The current time is placed in ${plain(field[1])}.`
          : 'The date and time of the run (sy-datum, sy-uzeit) are refreshed.',
        tag: 'get',
      };
    }
    const reference = /^GET\s+REFERENCE\s+OF\s+(\S+)\s+INTO\s+(\S+)/i.exec(text);
    if (reference) {
      return { anchors, core: `A reference to ${plain(reference[1])} is stored in ${plain(reference[2])}.`, tag: 'get' };
    }
    if (/^GET\s+CURSOR\b/i.test(text)) {
      return { anchors, core: 'The cursor position on the screen or in the list is read.', tag: 'get' };
    }
    if (!isLdbGet(text)) return null;
    const ldb = /^GET\s+([A-Za-z0-9_]+)/i.exec(text);
    const entity = ldb ? tableTerm(ldb[1]) : null;
    return {
      anchors,
      core: `Every ${entity ? entity.singular : (ldb?.[1] ?? '')} record supplied by the logical database is processed.`,
      notes: ['Which records these are is determined by the logical database with its selection screen, not by the report.'],
      tag: 'get',
    };
  }

  if (keyword === 'SET' && /^SET\s+PF-STATUS\b/i.test(text)) {
    const status = /PF-STATUS\s+('[^']*'|\S+)/i.exec(text);
    return { anchors, core: `The GUI status ${status ? (literalOf(status[1]) ?? status[1]) : ''} is set.`, tag: 'status' };
  }

  if (keyword === 'LEAVE') {
    return { anchors, core: leaveSentence(statement, statements), tag: 'leave' };
  }

  if (keyword === 'CREATE' && /^CREATE\s+DATA\b/i.test(text)) {
    return {
      anchors,
      core: 'A data object of the type named at runtime is created.',
      notes: ['No database rows are loaded in the process.'],
      tag: 'create',
    };
  }

  if (keyword === 'ASSIGN') {
    if (/\bCOMPONENT\b/i.test(text)) {
      return { anchors, core: 'A component of the structure is bound to the field symbol.', tag: 'assign' };
    }
    // Nur `ASSIGN ('(PROGRAMM)FELD') …` greift in den Speicher eines anderen
    // Programms. Ein gewöhnliches ASSIGN bindet ein Feld dieses Programms.
    const source = /^ASSIGN\s+(\([^)]*\)|\S+)\s+TO\s+(\S+)/i.exec(text);
    const dynamic = source && /^\(/.test(source[1]) ? source[1].slice(1, -1).trim() : null;
    const dynamicValue = dynamic ? (literalOf(dynamic) ?? resolveValue(dynamic, statements, statement.index).value) : null;
    if (dynamic && dynamicValue && /^\(\S+\)/.test(dynamicValue)) {
      return {
        anchors,
        core: 'A field from the memory of another program is bound.',
        notes: ['Whether it exists there is decided by the calling context at runtime.'],
        tag: 'assign',
      };
    }
    if (dynamic) {
      return {
        anchors,
        core: `A field named only at runtime is bound to ${source ? plain(source[2]) : 'the field symbol'}.`,
        tag: 'assign',
      };
    }
    return {
      anchors,
      core: source ? `${plain(source[1])} is bound to the field symbol ${source[2].replace(/[.,]$/, '')}.` : 'A field is bound to a field symbol.',
      tag: 'assign',
    };
  }

  if (keyword === 'EXEC') {
    return {
      anchors,
      core: 'A Native SQL block is executed.',
      notes: ['Native SQL has no automatic client filter.'],
      tag: 'exec',
    };
  }

  if (keyword === 'APPEND') {
    const target = /\bTO\s+(\S+)$/i.exec(text);
    return {
      anchors,
      core: `A row is added${target ? ` to ${plain(target[1])}` : ''}.`,
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
      core: `The local child class inherits from the class ${base ? base[1] : ''}.`.replace(/\s+/g, ' '),
      notes: known ? [] : ['This base class is not contained in the supplied code.'],
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
      return { anchors, core: `The local structure contains ${enumerate(fields)}.`, tag: 'types' };
    }
  }

  if (keyword === 'TRANSLATE' && /\b(?:UPPER|LOWER)\s+CASE\b/i.test(text)) {
    // „Die Eingabe" nur für ein Feld des Selektionsbilds; „keine Ablehnung"
    // nur, wenn im Rest der Einheit wirklich nichts ablehnen kann (F6).
    const field = /^TRANSLATE\s+(\S+)/i.exec(text)?.[1] ?? '';
    const input =
      fromSelectionScreen(field) ||
      statements.some((other) => new RegExp(`^PARAMETERS\\s+${escapeForRegExp(plain(field))}\\b`, 'i').test(other.text));
    const unit = processingUnit(statements, stack, statement.index);
    const rejecting = statements
      .slice(statement.index + 1, unit.end)
      .some((other) => /^(?:MESSAGE|RAISE|RETURN|LEAVE|CHECK|EXIT|STOP)\b/i.test(other.text));
    const upper = /\bUPPER\s+CASE\b/i.test(text);
    return {
      anchors,
      core: `${input ? 'The input' : `The content of ${plain(field)}`} is converted to ${upper ? 'upper case' : 'lower case'}.`,
      notes: input && !rejecting ? ['The input is never rejected.'] : [],
      tag: 'translate',
    };
  }

  // Ein Methodenaufruf, ob mit oder ohne Zuweisung: `lv_x = cls=>meth( … )`,
  // `obj->meth( … )`, `super->route( … )`. Was die Methode tut, steht nur dann
  // fest, wenn sie im gelieferten Code definiert ist — sonst wird es gesagt.
  const method = /([A-Za-z0-9_/<>]+)(=>|->)([A-Za-z0-9_]+)\s*\(/.exec(text);
  if (method) {
    const owner = method[1];
    const name = method[3];
    // F7: „nicht belegt" nur, wenn die Methode wirklich fehlt. Bis hierher
    // prüfte ein Muster auf `METHODS name` — in einem Template-String, in dem
    // `\s` zu `s` und `\b` zu einem Backspace wurde; es traf nie, und jede
    // Methode galt als fehlend, auch die im selben Quelltext implementierten.
    const { head, note } = resolveCall(statements, owner, method[2] as '->' | '=>', name, statement.index);
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
      ? `The return value of the method ${name} of ${owner} is placed in ${plain(receiver)}.`
      : `The method ${name} of ${owner} is called${exported ? `; its result is placed in ${plain(exported[1])}` : ''}${effects.length > 0 ? `; it ${enumerate(effects)}` : ''}.`;
    return {
      anchors,
      core,
      notes: note ? [note] : [],
      tag: 'method',
    };
  }

  if (keyword === 'READ' && /^READ\s+TABLE\b/i.test(text)) {
    const table = /^READ\s+TABLE\s+(\S+)/i.exec(text);
    return {
      anchors,
      core: `A matching row is searched for in the table${table ? ` ${plain(table[1])}` : ''}.`,
      tag: 'read',
    };
  }

  if (keyword === 'LOOP') {
    const over = /^LOOP\s+AT\s+(\S+)/i.exec(text);
    if (over && /^SCREEN$/i.test(over[1])) {
      return { anchors, core: 'Each element of the screen is processed one by one.', tag: 'loop' };
    }
    // „Jede Zeile" ist falsch, sobald ein WHERE die Schleife einschränkt —
    // dann läuft sie nur über die passenden Zeilen, und genau das sagt der Satz.
    const where = /\bWHERE\s+(.+?)(?:\s+(?:GROUP\s+BY|ASSIGNING|INTO|REFERENCE\s+INTO|TRANSPORTING|FROM|TO|USING\s+KEY)\b|$)/i.exec(text);
    if (over && where) {
      return {
        anchors,
        core: `The rows from ${plain(over[1])} for which ${conditionClause(where[1])} are processed one by one.`,
        tag: 'loop',
      };
    }
    if (over && /\bGROUP\s+BY\b/i.test(text)) {
      return { anchors, core: `The rows from ${plain(over[1])} are processed group by group.`, tag: 'loop' };
    }
    return {
      anchors,
      core: `Every row${over ? ` from ${plain(over[1])}` : ''} is processed one by one.`,
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
  if (keyword === 'COMMIT') return 'COMMIT WORK is executed';
  if (keyword === 'ROLLBACK') return 'ROLLBACK WORK is executed';
  if (keyword === 'WRITE') {
    const formatted = WRITE_TO.exec(text);
    if (formatted) return `a value is formatted into ${plain(formatted[2])}`;
    return `${writtenTarget(statement, origins).label} is output`;
  }
  if (keyword === 'RETURN') return 'the block is exited';
  if (keyword === 'EXIT') {
    const stack = stacks?.[statement.index] ?? [];
    const innermost = [...stack].reverse().find((block) => block.kind === 'loop' || block.kind === 'routine');
    return innermost?.kind === 'loop' ? 'the loop is exited' : 'the block is exited';
  }
  if (keyword === 'CONTINUE') return 'the loop pass is skipped';
  if (keyword === 'LEAVE') return leavePhrase(statement) ?? 'the current processing is exited';
  if (keyword === 'MESSAGE') return messageFragment(text);
  if (keyword === 'MODIFY') return 'a row is inserted or overwritten';
  if (keyword === 'APPEND') return 'a row is added';
  if (keyword === 'UPDATE') return 'a row is changed';
  if (keyword === 'PERFORM') {
    const name = /^PERFORM\s+([A-Za-z0-9_]+)/i.exec(text);
    return name ? `${name[1]} is called` : null;
  }
  if (keyword === 'CALL') {
    const fn = /^CALL\s+FUNCTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (fn) return `${literalOf(fn[1]) ?? fn[1]} is called`;
    return null;
  }
  const assign = /^(\S+)\s*=\s*('[^']*'|`[^`]*`|-?\d+)\s*$/.exec(text);
  if (assign) return `${nounPhrase(assign[1])} is set to ${literalOf(assign[2]) ?? assign[2]}`;
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
    return lead(subject === 'Otherwise' ? subject : `For ${lowerFirst(subject)}`);
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
  if (flag) return flagLead(flag[1], flag[2] === '=');
  // „Beträge größer 10000" ist ein Subjekt, kein Satzanfang vor „wird".
  // Das Fallbuch schreibt an dieser Stelle „Für größere Beträge wird …", und
  // genau diese Form trägt auch einen erzeugten Satz.
  const plural = pluralSubject(head);
  if (plural) return lead(`For ${lowerFirst(plural)}`);
  return lead(`If ${conditionClause(head, subrcClauseAt(statements, chainHead))}`, true);
}

/**
 * Erster Buchstabe klein — aber **nur** bei einem Adjektiv.
 *
 * Deutsch schreibt Substantive groß, auch mitten im Satz: „Für Beträge größer
 * 10000" ist richtig, „für beträge" ist es nicht. Klein wird deshalb nur, was
 * hier als Adjektiv aufgeführt ist, und nichts sonst.
 */
function lowerFirst(text: string): string {
  const [first] = text.split(' ');
  // English writes nouns and adjectives in lower case mid-sentence; an
  // identifier or an acronym ("G/L", "lv_x", "IDoc") stays as written.
  if (!/^[A-Z][a-z-]*$/.test(first)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/** "a" or "an" before a business word. */
function indefinite(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

/**
 * The first word of a sentence. A phrase that starts with an English article
 * or word is capitalised; an identifier or a literal from the source ("lv_x",
 * "RECORDED") stays exactly as written.
 */
function startSentence(text: string): string {
  return /^(?:the|a|an|processing|list|nothing|it)\b/.test(text) ? capitalize(text) : text;
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
        ? `${compose(first.subject, first.phrase)}; otherwise ${rest[0].phrase}.`
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
  if (chain && /; otherwise /.test(chain.core)) return [chain];
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
    // Lauter PERFORMs sind drei Aufrufe nacheinander, nicht einer mit
    // Parametern — der Satz sagt beides: welche Art und in welcher Folge.
    const performs = run.every((statement) => /^PERFORM\s+[A-Za-z0-9_]+/i.test(statement.text));
    if (run.length >= 2 && !onlyOutput) {
      const names = run.map((statement) => /^PERFORM\s+([A-Za-z0-9_]+)/i.exec(statement.text)?.[1] ?? '');
      drafts.push({
        anchors: run.map(range),
        core: performs
          ? `The subroutines ${enumerate(names)} are called one after another${
              run.some((statement) => /\b(?:USING|CHANGING|TABLES)\b/i.test(statement.text)) ? '' : ', each without parameters'
            }.`
          : `${startSentence(enumerate(fragments))}.`,
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
    core: `The result of ${name} is placed in ${plain(importing[1])}.`,
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
  // One verb for what the list names, counted as `enumerate` counts it: two
  // columns that both print "the field returned by the function module" are one.
  const verb = new Set(labels).size > 1 ? 'are' : 'is';
  const anchors = group.map(range);
  if (inLoop) {
    return {
      anchors,
      core: `With hits, ${enumerate(labels)} ${verb} output as a list.`,
      grain: 'group',
      tag: 'list',
    };
  }
  if (group.length === 1) return null;
  return { anchors, core: `${startSentence(enumerate(labels))} ${verb} output.`, grain: 'group', tag: 'list' };
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
        // Eine Kette `WRITE: / a, b.` sind mehrere Anweisungen auf derselben Zeile.
        for (const covered of statements) {
          if (covered.lineStart === anchor.lineStart && covered.lineEnd === anchor.lineEnd) inBranch.add(covered.index);
        }
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
    const branch = branchAssignment(statement, stack, statements);
    if (branch) {
      out.push(build(branch));
      continue;
    }
    const plainSet = plainAssignment(statement, statements, stack);
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
    if (result && !(draft && /takes its output into/.test(draft.core))) out.push(build(result));
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
