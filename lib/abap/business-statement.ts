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
import { tableTerm, termFor, type BusinessTerm } from './business-glossary';

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
  CLASS: 'class',
};

const CLOSERS = new Set([
  'ENDIF', 'ENDLOOP', 'ENDDO', 'ENDWHILE', 'ENDCASE', 'ENDTRY', 'ENDFORM', 'ENDMETHOD', 'ENDMODULE', 'ENDCLASS', 'ENDSELECT',
]);

/** Für jede Anweisung der Stapel der offenen Blöcke — ohne zweiten Parser. */
function blockStacks(statements: readonly AbapStatement[]): Block[][] {
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
    if (keyword === 'CATCH') {
      stack.pop();
      stack.push({ kind: 'catch', head: statement });
      stacks.push([...stack]);
      continue;
    }
    stacks.push([...stack]);
    const opener = OPENERS[keyword];
    if (opener) stack.push({ kind: opener, head: statement });
    // `SELECT … ENDSELECT` ist eine Schleife; `SELECT … INTO TABLE` nicht.
    if (keyword === 'SELECT' && !/\bINTO\s+TABLE\b/i.test(statement.text) && !/\bSINGLE\b/i.test(statement.text)) {
      stack.push({ kind: 'loop', head: statement });
    }
  }
  return stacks;
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
    const call = /^(?:DATA\()?([A-Za-z0-9_]+)\)?\s*=\s*\S+(?:=>|->)\w+\s*\(/.exec(text);
    if (call) origins.set(call[1].toLowerCase(), 'method-return');
  }
  return origins;
}

/** `WRITE / 'X'` oder `WRITE / lv_x` — der häufigste Anker des Korpus. */
function writtenTarget(
  statement: AbapStatement,
  origins?: Map<string, ValueOrigin>,
): { label: string; literal: boolean } {
  const body = statement.text.replace(/^WRITE\s*/i, '').replace(/^\/?\s*/, '').replace(/^\/\s*/, '').trim();
  const literal = literalOf(body);
  if (literal != null) return { label: literal, literal: true };
  const origin = origins?.get(plain(body).toLowerCase());
  if (origin && origin !== 'none') return { label: ORIGIN_TERMS[origin], literal: false };
  return { label: termFor(body).singular, literal: false };
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

/** Die Wächter: `IF … . WRITE 'X'. RETURN.` — Bedingung, Ausgabe und Rücksprung als eine Aussage. */
function guardSentence(
  statements: readonly AbapStatement[],
  index: number,
  origins: Map<string, ValueOrigin>,
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

  const body: AbapStatement[] = [];
  for (let i = index + 1; i < statements.length; i += 1) {
    const next = statements[i];
    const keyword = next.keyword.toUpperCase();
    if (keyword === 'ENDIF' || keyword === 'ELSE' || keyword === 'ELSEIF') break;
    body.push(next);
    if (body.length > 4) break;
  }
  const write = body.find((s) => s.keyword.toUpperCase() === 'WRITE');
  const leave = body.find((s) => ['RETURN', 'LEAVE', 'EXIT'].includes(s.keyword.toUpperCase()));
  if (!leave) return null;

  let subject: string;
  // Eine interne Tabelle (`lt_`, `gt_`, `it_`) ist leer, wenn nichts gefunden
  // wurde — fachlich heißt das „ohne Treffer", nicht „ohne Zeile".
  if (initial) subject = INTERNAL_TABLE.test(initial[1]) ? 'Ohne Treffer' : `Ohne ${termFor(initial[1]).singular}`;
  else if (subrc) {
    // Ein `sy-subrc` sagt für sich nichts. Was es bedeutet, steht in der
    // Anweisung **davor**: nach einer Berechtigungsprüfung heißt „<> 0" fehlende
    // Berechtigung, nach einem Lesen fehlender Treffer.
    // Die Berechtigungsprüfung steht selten unmittelbar vor ihrem `IF`: dazwischen
    // liegen oft die Kopie von `sy-subrc` und andere Vorbereitungen. Gesucht wird
    // deshalb in den letzten vier Anweisungen, und nur dort.
    const auth =
      statements
        .slice(Math.max(0, index - 4), index)
        .reverse()
        .find((other) => other.keyword.toUpperCase() === 'AUTHORITY-CHECK') ?? null;
    if (auth) {
      const object = /OBJECT\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(auth.text);
      const field = /ID\s+'[^']*'\s+FIELD\s+([ps]_\w+)/i.exec(auth.text);
      const restriction = field ? ` für den eingegebenen ${termFor(field[1]).singular}` : '';
      subject = `Ohne Berechtigung auf ${object ? (literalOf(object[1]) ?? object[1]) : ''}${restriction}`;
    } else {
      subject = subrc[1] === '<>' ? 'Ohne Treffer' : 'Bei Treffer';
    }
  }
  else if (compare) {
    // Ein Kennzeichen ist im ABAP ein `= 'X'`; fachlich ist es „gesetzt" oder
    // „nicht gesetzt", und genau so liest es ein Fachbereichsmensch.
    const value = literalOf(compare[3]) ?? plain(compare[3]);
    const name = plain(compare[1]);
    if (value === 'X') {
      subject = compare[2] === '=' ? `Mit gesetztem ${name}` : `Ohne gesetztes ${name}`;
    } else {
      subject = compare[2] === '=' ? `Bei ${name} gleich ${value}` : `Bei ${name} ungleich ${value}`;
    }
  } else return null;

  const anchors = [range(head), ...(write ? [range(write)] : []), range(leave)];
  const label = write ? writtenTarget(write, origins).label : null;
  // **Was der Wächter verhindert, ist die Aussage** — nicht, dass er greift.
  // Steht hinter ihm eine Datenbankänderung, dann ist „es wird nichts
  // geschrieben" keine Floskel, sondern genau das, was dieser Zweig belegt.
  // Steht keine da, wird es auch nicht behauptet.
  const guardsAWrite = statements
    .slice(leave.index + 1)
    .some((next) => DB_WRITE.test(next.text));
  const exit = guardsAWrite
    ? 'vor der Datenbankoperation zurückgekehrt; es wird nichts geschrieben'
    : 'der Block verlassen';
  const core = label
    ? `${subject} wird ${label} ausgegeben und ${exit}.`
    : `${subject} wird ${exit}.`;
  return { anchors, core, grain: 'group', tag: 'guard' };
}

/** Was eine Datenbankzeile ändern kann — die Liste, auf die sich der Wächter beruft. */
const DB_WRITE = /^(UPDATE|MODIFY|INSERT|DELETE|EXEC\s+SQL)\b|execute_update|CALL\s+TRANSACTION|IN\s+UPDATE\s+TASK/i;

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

/** Die Sätze, die aus einer einzelnen Anweisung kommen. */
function sentenceFor(
  statement: AbapStatement,
  statements: readonly AbapStatement[],
  stack: Block[],
  origins: Map<string, ValueOrigin>,
): Draft | null {
  const text = statement.text;
  const keyword = statement.keyword.toUpperCase();
  const anchors = [range(statement)];

  if (keyword === 'WRITE') {
    const written = statement.text.replace(/^WRITE\s*/i, '').replace(/^\/?\s*/, '').trim();
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
  const persistenceNotes = (): string[] => {
    const notes: string[] = [];
    const rest = statements.slice(statement.index + 1);
    if (!statements.some((other) => other.keyword.toUpperCase() === 'COMMIT')) {
      notes.push('Angekündigt, nicht persistiert: im gelieferten Code steht kein COMMIT WORK.');
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
    const keyed = /WHERE\s+\S+\s*=\s*@?[ps]_/i.test(text);
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

  if (keyword === 'COMMIT') {
    return { anchors, core: 'Mit COMMIT WORK wird die Änderung persistiert.', tag: 'commit' };
  }
  if (keyword === 'ROLLBACK') {
    return { anchors, core: 'Mit ROLLBACK WORK wird die Änderung verworfen; nichts ist persistiert.', tag: 'rollback' };
  }

  if (keyword === 'PERFORM') {
    const name = /^PERFORM\s+(\([^)]+\)|[A-Za-z0-9_]+)/i.exec(text);
    const external = /\bIN\s+PROGRAM\b/i.test(text);
    return {
      anchors,
      core: `Das ${external ? 'externe ' : ''}Unterprogramm ${name ? plain(name[1]) : ''} wird aufgerufen.`.replace(/\s+/g, ' '),
      notes: ['Seine Wirkung ist im gelieferten Code nicht belegt.'],
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
    return { anchors, core: 'Eine Meldung wird ausgegeben.', tag: 'message' };
  }

  if (keyword === 'CHECK') {
    const { subject } = conditionSubject(text);
    return {
      anchors,
      core: `Nur ${subject} gehen weiter; kleinere werden übersprungen, die Schleife läuft weiter.`,
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
        notes.push('An der Aufrufstelle wird nichts geändert; er läuft erst mit dem COMMIT WORK.');
      } else if (/\bSTARTING\s+NEW\s+TASK\b/i.test(text)) {
        core = `Der Baustein ${name} wird asynchron in einer eigenen Task gestartet.`;
        notes.push('Ein Ergebnis liegt zu diesem Zeitpunkt nicht vor.');
      } else if (/\bDESTINATION\b/i.test(text)) {
        core = `Ein entferntes System wird über die eingegebene Destination benachrichtigt.`;
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
      return { anchors, core: `Das Ergebnis der gewählten Methode wird ermittelt.`, tag: 'call' };
    }
    const transaction = /^CALL\s+TRANSACTION\s+('[^']*'|[A-Za-z0-9_]+)/i.exec(text);
    if (transaction) {
      const name = literalOf(transaction[1]) ?? transaction[1];
      return {
        anchors,
        core: `Die Anlage wird über die Transaktion ${name} angestoßen.`,
        notes: ['Ob und was persistiert wird, entscheidet die aufgerufene Transaktion.'],
        tag: 'call',
      };
    }
    const screen = /^CALL\s+SCREEN\s+(\d+)/i.exec(text);
    if (screen) {
      return { anchors, core: `Das Programm ruft eine Screenfolge ab ${screen[1]} auf.`, tag: 'call' };
    }
    const badi = /^CALL\s+BADI\s+(\S+)/i.exec(text);
    if (badi) {
      const name = badi[1].split('->')[1] ?? badi[1];
      return {
        anchors,
        core: `Der Betrag wird der Methode ${name} übergeben und ein Routentext übernommen.`,
        notes: ['Dieser Aufruf ist nicht selbst ein menschlicher Freigabeprozess.'],
        tag: 'call',
      };
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
    return { anchors, core: 'Die Screenfolge wird beendet.', tag: 'leave' };
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
      ? statements.some((other) => new RegExp(`^CLASS\s+${base[1]}\s+DEFINITION`, 'i').test(other.text))
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
    const defined = statements.some((other) =>
      new RegExp(`^(?:CLASS-)?METHODS\s+${name}\b`, 'i').test(other.text),
    );
    const target = /^([A-Za-z0-9_()]+)\s*=/.exec(text);
    const core = target
      ? `Der Rückgabewert der Methode ${name} von ${owner} wird nach ${plain(target[1])} übernommen.`
      : `Die Methode ${name} von ${owner} wird aufgerufen.`;
    return {
      anchors,
      core,
      notes: defined ? [] : ['Ihr fachliches Verhalten ist im gelieferten Code nicht belegt.'],
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
function bodyFragment(statement: AbapStatement, origins: Map<string, ValueOrigin>): string | null {
  const text = statement.text;
  const keyword = statement.keyword.toUpperCase();
  if (keyword === 'COMMIT') return 'COMMIT WORK ausgeführt';
  if (keyword === 'ROLLBACK') return 'ROLLBACK WORK ausgeführt';
  if (keyword === 'WRITE') return `${writtenTarget(statement, origins).label} ausgegeben`;
  if (keyword === 'RETURN' || keyword === 'EXIT') return 'der Block verlassen';
  if (keyword === 'LEAVE') return 'die Screenfolge beendet';
  if (keyword === 'MESSAGE') return 'eine Meldung ausgegeben';
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
function branchChain(statements: readonly AbapStatement[], index: number): Branch[] | null {
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
    if (OPENERS[keyword]) depth += 1;
    else if (CLOSERS.has(keyword)) depth -= 1;
    if (depth === 0) current.body.push(statement);
  }
  return null;
}

function branchSubject(branch: Branch): string {
  if (branch.kind === 'else') {
    const subject = elseSubject(branch.previous);
    return subject === 'Sonst' ? subject : `Für ${lowerFirst(subject)}`;
  }
  const head = branch.head.text;
  const subrc = /^(?:IF|ELSEIF)\s+sy-subrc\s*(<>|=)\s*0\s*$/i.exec(head);
  if (subrc) return subrc[1] === '<>' ? 'Ohne Treffer' : 'Bei Treffer';
  const initial = /^(?:IF|ELSEIF)\s+(\S+)\s+IS\s+(NOT\s+)?INITIAL\s*$/i.exec(head);
  if (initial) {
    if (INTERNAL_TABLE.test(initial[1])) return initial[2] ? 'Bei Treffern' : 'Ohne Treffer';
    const word = termFor(initial[1]).singular;
    return initial[2] ? `Mit einer nicht leeren ${word}` : `Ohne ${word}`;
  }
  const flag = /^(?:IF|ELSEIF)\s+(\S+)\s*(<>|=)\s*'X'\s*$/i.exec(head);
  if (flag) return flag[2] === '=' ? `Mit gesetztem ${plain(flag[1])}` : `Ohne gesetztes ${plain(flag[1])}`;
  // „Beträge größer 10000" ist ein Subjekt, kein Satzanfang vor „wird".
  // Das Fallbuch schreibt an dieser Stelle „Für größere Beträge wird …", und
  // genau diese Form trägt auch einen erzeugten Satz.
  return `Für ${lowerFirst(conditionSubject(head).subject)}`;
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
): Draft[] {
  const branches = branchChain(statements, index);
  if (!branches) return [];
  const drafts: Draft[] = [];
  const parts: Array<{ branch: Branch; subject: string; phrase: string }> = [];
  for (const branch of branches) {
    const fragments = branch.body
      .map((statement) => bodyFragment(statement, origins))
      .filter((fragment): fragment is string => fragment !== null);
    if (fragments.length === 0) continue;
    const phrase = enumerate(fragments);
    const subject = branchSubject(branch);
    parts.push({ branch, subject, phrase });
    drafts.push({
      anchors: [range(branch.head), ...branch.body.map(range)],
      core: `${subject} wird ${phrase}.`,
      grain: 'group',
      tag: `branch${branch.head.lineStart}`,
    });
  }
  if (parts.length >= 2) {
    const [first, ...rest] = parts;
    drafts.push({
      anchors: [
        range(first.branch.head),
        ...parts.flatMap((part) => [range(part.branch.head), ...part.branch.body.map(range)]),
      ],
      core: `${first.subject} wird ${first.phrase}, sonst ${rest.map((part) => part.phrase).join(' beziehungsweise ')}.`,
      grain: 'group',
      tag: `chain${first.branch.head.lineStart}`,
    });
  }
  return drafts;
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
    const onlyOutput = run.every((statement) => statement.keyword.toUpperCase() === 'WRITE');
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
    const fragment = bodyFragment(statements[i], origins);
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
function resultSentence(statement: AbapStatement): Draft | null {
  if (!/^CALL\s+FUNCTION\b/i.test(statement.text)) return null;
  if (/\bIN\s+UPDATE\s+TASK\b|\bSTARTING\s+NEW\s+TASK\b/i.test(statement.text)) return null;
  const importing = /\bIMPORTING\s+\w+\s*=\s*(\S+)/i.exec(statement.text);
  if (!importing) return null;
  return {
    anchors: [range(statement)],
    core: `Das konvertierte Ergebnis wird in ${plain(importing[1])} übernommen.`,
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
  const stacks = blockStacks(statements);
  const origins = originMap(statements);
  const out: BusinessStatement[] = [];

  for (let i = 0; i < statements.length; i += 1) {
    const guard = guardSentence(statements, i, origins);
    if (guard) out.push(build(guard));
    for (const draft of branchSentences(statements, i, origins)) out.push(build(draft));
  }
  for (const draft of sequenceSentences(statements, stacks, origins)) out.push(build(draft));

  // Ausgabeläufe: zusammenhängende WRITEs im selben Block.
  let run: AbapStatement[] = [];
  let runStack: Block[] = [];
  const flush = () => {
    if (run.length > 0) {
      const draft = listSentence(run, runStack.some((block) => block.kind === 'loop'), origins);
      if (draft) out.push(build(draft));
    }
    run = [];
  };
  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    if (statement.keyword.toUpperCase() === 'WRITE') {
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
    const draft = sentenceFor(statement, statements, stack, origins);
    if (draft) out.push(build(draft));
    const result = resultSentence(statement);
    if (result) out.push(build(result));
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
