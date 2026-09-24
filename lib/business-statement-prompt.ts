import { buildProcessSkeleton, type SkeletonNodeKind } from './abap/process-skeleton';
import { readStatements, type AbapStatement, type SourceRange } from './abap/statement-reader';
import { inspectModelText } from './model-text';
import type { ProvenanceValue } from './provenance';

/**
 * Der Fachsatz vom Modell — Roadmap 17.8, Weg B.
 *
 * Weg A (`lib/abap/business-statement.ts`) bildet den Fachsatz deterministisch
 * aus dem Quelltext und setzt die Untergrenze. Dieses Modul ist der zweite
 * Erzeuger: ein Prompt, der **verankerte Einzelsätze** je ABAP-Anweisung und
 * BPMN-Element bestellt — nicht die Executive Summary, die
 * `lib/analysis-prompt.ts` bestellt und die dort bleibt, wie sie ist.
 *
 * Die ganze Konstruktion folgt `lib/process-naming.ts`:
 *
 *   - **Der Prompt ist nicht die Verteidigung.** Was hält, ist
 *     `validateStatementAnswer`: ein Anker, der auf keine Zeile mit einer
 *     ABAP-Anweisung zeigt, eine Datei, die es nicht gibt, ein Element, das das
 *     Skelett nicht hat oder das nicht an der Ankerzeile steht — der Satz wird
 *     verworfen und **gezählt**, nie repariert. Was das Modell sagt, fügt keinen
 *     Anker und keine Zeile hinzu, die der Quelltext nicht hat.
 *   - **Herkunft `proposed`** (`lib/provenance.ts`, *Model proposal*), und der
 *     Typ unten lässt nichts anderes zu. Ein offener Rest hängt als Vorbehalt
 *     **an** dem Satz, mit `not-determined` — nie an seiner Stelle
 *     (Forderung 3 aus 17.6: erst auflösen, dann ausweisen).
 *   - **Außerhalb jeder Signatur.** Wie jedes Narrativ: `runs/create` signiert
 *     `Omit<…, 'analysis'>`, und ein Fachsatz ist eine Lesart, deren Wortlaut
 *     sich ändern darf, ohne dass eine Quittung bricht.
 *
 * Noch **nicht verdrahtet** — kein Aufruf aus der Oberfläche, keiner aus
 * `/api/runs/create`. 17.8 misst zuerst, ob dieser Weg die Engine überhaupt
 * schlägt; erst danach entscheidet Sonny, ob er in die Business-Sicht kommt.
 * Wenn, dann über `/api/gemini`, den einzigen Weg nach außen.
 *
 * Rein: keine Netzaufrufe, kein Schlüssel, kein Zustand.
 */

export const STATEMENT_PROMPT_FORMAT_VERSION = 1;

/** Ein Satz, der länger ist, sagt mehr als eine Sache. */
export const STATEMENT_MAX_LENGTH = 400;
/** Ein Vorbehalt ist ein Nebensatz, keine zweite Aussage. */
export const UNCERTAINTY_MAX_LENGTH = 240;
/** Mehr Sätze, als ein Ausschnitt Anweisungen hat, sind kein Fachsatz je Anweisung mehr. */
export const MAX_STATEMENTS = 80;
/** Größer wird die Antwort nicht gelesen. */
export const MAX_ANSWER_LENGTH = 100_000;

export interface StatementSource {
  name: string;
  code: string;
}

/** Ein BPMN-Element, wie der Prompt es nennt: der Knoten des Skeletts. */
export interface StatementElement {
  /** Die Id im Prompt: die Knoten-Id, bei mehreren Dateien `datei/knoten`. */
  id: string;
  file: string;
  nodeId: string;
  kind: SkeletonNodeKind;
  label: string;
  anchor: SourceRange | null;
}

export interface StatementContext {
  sources: Array<{ name: string; code: string; lineCount: number; statements: AbapStatement[] }>;
  elements: Map<string, StatementElement>;
}

/** Den Kontext einmal bilden — Prompt und Prüfung lesen denselben. */
export function buildStatementContext(sources: readonly StatementSource[]): StatementContext {
  const multi = sources.length > 1;
  const elements = new Map<string, StatementElement>();
  const read = sources.map((source) => {
    const code = source.code.replace(/\r\n/g, '\n');
    const lines = code.split('\n');
    const lineCount = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
    for (const node of buildProcessSkeleton(code).nodes) {
      const id = multi ? `${source.name}/${node.id}` : node.id;
      elements.set(id, {
        id,
        file: source.name,
        nodeId: node.id,
        kind: node.kind,
        label: node.label,
        anchor: node.anchor ? { lineStart: node.anchor.lineStart, lineEnd: node.anchor.lineEnd } : null,
      });
    }
    return { name: source.name, code, lineCount, statements: readStatements(code) };
  });
  return { sources: read, elements };
}

/**
 * Der Prompt. Er bestellt Einzelsätze, keine Zusammenfassung, und er sagt,
 * wie ein Fachsatz aussieht — die drei Forderungen aus 17.6 in Anweisungen
 * übersetzt. Das Beispiel ist erfunden und stammt aus keinem Korpusfall; ein
 * Sollsatz im Prompt wäre ein abgeschriebenes Ergebnis.
 */
export function buildStatementPrompt(context: StatementContext): string {
  const lines: string[] = [
    'You explain what a piece of ABAP code does, statement by statement, for a business reader who does not read ABAP.',
    '',
    'Write one business statement ("Fachsatz") per business-relevant step of the code: a condition and what follows from it,',
    'a read (which table, which key, which fields), a write, a call, an authorization check, an output, a message, an exit.',
    'Do not write a summary, an assessment or a recommendation. Do not write statements about declarations',
    '(DATA, TYPES, CLASS ... DEFINITION, METHODS) or block ends.',
    '',
    'Rules for every statement:',
    '1. German, one sentence (a semicolon for a closely related second clause is fine), plain language, no Markdown, no backticks.',
    '2. Say what happens in business terms: name the business thing ("der Betrag", "die Kundennummer"), not the variable',
    '   (iv_amount, lv_name), and write in the passive voice ("wird gelesen"), never "das System" or "das Programm".',
    '   Keep the concrete facts the code writes: literal values, table and field names, exact comparison boundaries',
    '   ("bis einschließlich 100", "größer als 100").',
    '3. One statement per outcome: each branch of a condition gets its own statement, anchored to the condition line and to',
    '   the line(s) of that branch.',
    '4. Say only what the code at the anchored lines does. Do not claim effects the code does not perform: a status text is not an',
    '   approval, a message is not a stored record, a name of a variable is not proof of its business meaning.',
    '5. Resolve before you qualify: if a value is dynamic, look in the given code for where it is set and state it. Only what',
    '   remains genuinely open goes into "uncertainty" — never instead of the statement, always beside it. Otherwise null.',
    '6. Anchor every statement to the line(s) of the ABAP statement(s) it describes, written as "<file>:<line>", using the line',
    '   numbers shown below. Only lines that carry code.',
    '7. "element": the id of the process element from the list below that this statement belongs to, or null if none fits.',
    '   The element must stand on one of your anchored lines.',
    '',
    'Answer with JSON only, in exactly this shape and with no other keys:',
    '{"statements":[{"text":"<statement>","anchors":["<file>:<line>"],"element":"<element id or null>","uncertainty":"<open rest or null>"}]}',
    '',
    'Example of the style (invented code, not from the input):',
    '{"text":"Ist die Bestellmenge größer als 100, wird der Status HOLD gesetzt; sonst bleibt er unverändert.","anchors":["demo.abap:12","demo.abap:13"],"element":"nd-5-0","uncertainty":null}',
    '',
    'Process elements, as "id | kind | technical label | lines":',
  ];
  if (context.elements.size === 0) lines.push('(none)');
  for (const element of context.elements.values()) {
    const where = element.anchor
      ? `${element.file}:${element.anchor.lineStart}${element.anchor.lineEnd !== element.anchor.lineStart ? `-${element.anchor.lineEnd}` : ''}`
      : 'no anchor';
    lines.push(`${element.id} | ${element.kind} | ${element.label} | ${where}`);
  }
  for (const source of context.sources) {
    lines.push('', `Source ${source.name}, with line numbers:`);
    source.code.split('\n').slice(0, source.lineCount).forEach((text, index) => {
      lines.push(`${String(index + 1).padStart(4)}  ${text}`);
    });
  }
  return lines.join('\n');
}

/* ------------------------------------------------------------------ *
 * Validation. Dropped and counted, never repaired.
 * ------------------------------------------------------------------ */

/** Why a piece of the answer was dropped. One reason per dropped piece. */
export type StatementRejection =
  | 'empty-answer'
  | 'too-large'
  | 'malformed-json'
  | 'not-an-object'
  /** A key outside the format, on the answer or on a statement. */
  | 'unexpected-field'
  /** Not an object, text not a string, anchors not a list of strings. */
  | 'malformed-entry'
  /** Empty, too long, more than one line, or carries text the product must not show (`lib/model-text.ts`). */
  | 'bad-text'
  | 'bad-uncertainty'
  /** No anchor at all. A statement that does not say where has no place. */
  | 'no-anchor'
  /** An anchor that is not `<file>:<line>`. */
  | 'malformed-anchor'
  | 'unknown-file'
  | 'line-out-of-range'
  /** The line exists but carries no ABAP statement — a comment or a blank line. */
  | 'no-statement-at-line'
  | 'unknown-element'
  /** The element exists, but not on any anchored line. */
  | 'element-off-anchor'
  /** The same text at the same anchors twice. */
  | 'duplicate'
  /** Beyond `MAX_STATEMENTS`. */
  | 'too-many';

export interface StatementDiscardTally {
  total: number;
  byRule: Partial<Record<StatementRejection, number>>;
}

export interface StatementUncertaintyNote {
  note: string;
  provenance: Extract<ProvenanceValue, 'not-determined'>;
}

export interface ProposedStatement {
  /** `M` plus position in the accepted list. Stable within one answer only. */
  id: string;
  /** The statement as the model wrote it. */
  core: string;
  /** What stands at the element: core plus the open rest, in one text. */
  text: string;
  uncertainty: StatementUncertaintyNote | null;
  /** Every ABAP statement the sentence speaks about — the statement's range, not the model's line. */
  anchors: Array<{ file: string } & SourceRange>;
  /** The skeleton node this sentence belongs to, or null. */
  element: { id: string; file: string; nodeId: string } | null;
  /** Model sentences are proposals. Never anything else. */
  provenance: Extract<ProvenanceValue, 'proposed'>;
}

export interface ValidatedStatements {
  statements: ProposedStatement[];
  discarded: StatementDiscardTally;
}

class Tally {
  private counts: Partial<Record<StatementRejection, number>> = {};
  private sum = 0;

  bump(rule: StatementRejection, by = 1): void {
    if (by <= 0) return;
    this.counts[rule] = (this.counts[rule] ?? 0) + by;
    this.sum += by;
  }

  result(): StatementDiscardTally {
    return { total: this.sum, byRule: { ...this.counts } };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const STATEMENT_KEYS = new Set(['text', 'anchors', 'element', 'uncertainty']);
const ANCHOR = /^\s*([A-Za-z0-9_./\-]+\.abap)\s*:\s*(\d+)\s*$/;

function textProblem(text: string, max: number): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || trimmed.length > max || CONTROL.test(trimmed) || inspectModelText(trimmed, 'screen').length > 0;
}

/** One statement, or the reason it was dropped. */
function validateEntry(
  context: StatementContext,
  entry: unknown,
  tally: Tally,
): Omit<ProposedStatement, 'id'> | StatementRejection {
  if (!isPlainObject(entry)) return 'malformed-entry';
  const extra = Object.keys(entry).filter((key) => !STATEMENT_KEYS.has(key));
  // An extra key on a statement is counted, and the statement goes: a
  // "confidence" or a "line" of its own is the model adding what it may not.
  if (extra.length > 0) {
    tally.bump('unexpected-field', extra.length - 1);
    return 'unexpected-field';
  }
  const { text, anchors, element, uncertainty } = entry;
  if (typeof text !== 'string') return 'malformed-entry';
  if (textProblem(text, STATEMENT_MAX_LENGTH)) return 'bad-text';
  if (uncertainty != null && typeof uncertainty !== 'string') return 'malformed-entry';
  if (typeof uncertainty === 'string' && uncertainty.trim() !== '' && textProblem(uncertainty, UNCERTAINTY_MAX_LENGTH)) {
    return 'bad-uncertainty';
  }
  if (element != null && typeof element !== 'string') return 'malformed-entry';
  if (!Array.isArray(anchors)) return 'malformed-entry';
  if (anchors.length === 0) return 'no-anchor';

  const ranges: Array<{ file: string } & SourceRange> = [];
  for (const raw of anchors) {
    if (typeof raw !== 'string') return 'malformed-entry';
    const match = ANCHOR.exec(raw);
    if (!match) return 'malformed-anchor';
    const source = context.sources.find((candidate) => candidate.name === match[1]);
    if (!source) return 'unknown-file';
    const line = Number(match[2]);
    if (line < 1 || line > source.lineCount) return 'line-out-of-range';
    const statement = source.statements.find((s) => s.lineStart <= line && line <= s.lineEnd);
    if (!statement) return 'no-statement-at-line';
    if (!ranges.some((r) => r.file === source.name && r.lineStart === statement.lineStart)) {
      ranges.push({ file: source.name, lineStart: statement.lineStart, lineEnd: statement.lineEnd });
    }
  }

  let attached: ProposedStatement['element'] = null;
  if (typeof element === 'string' && element.trim() !== '' && element.trim().toLowerCase() !== 'null') {
    const found = context.elements.get(element.trim());
    if (!found) return 'unknown-element';
    const on =
      found.anchor != null &&
      ranges.some(
        (range) =>
          range.file === found.file && range.lineStart <= found.anchor!.lineEnd && found.anchor!.lineStart <= range.lineEnd,
      );
    if (!on) return 'element-off-anchor';
    attached = { id: found.id, file: found.file, nodeId: found.nodeId };
  }

  const core = text.trim();
  const open = typeof uncertainty === 'string' && uncertainty.trim() !== '' ? uncertainty.trim() : null;
  return {
    core,
    text: open ? `${core.replace(/[.\s]+$/, '')}; ${open}` : core,
    uncertainty: open ? { note: open, provenance: 'not-determined' } : null,
    anchors: ranges,
    element: attached,
    provenance: 'proposed',
  };
}

/**
 * The model's answer, checked against the source and the skeleton.
 *
 * Takes the raw text as it came back — not a parsed object — so "not JSON" is
 * one of the outcomes rather than an exception upstream. A fenced ```json
 * block is not unwrapped: the prompt asks for JSON only, and the product's
 * parser does not guess either. Never throws.
 */
export function validateStatementAnswer(context: StatementContext, answer: unknown): ValidatedStatements {
  const tally = new Tally();
  const nothing = (): ValidatedStatements => ({ statements: [], discarded: tally.result() });

  if (typeof answer !== 'string' || answer.trim() === '') { tally.bump('empty-answer'); return nothing(); }
  if (answer.length > MAX_ANSWER_LENGTH) { tally.bump('too-large'); return nothing(); }

  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    tally.bump('malformed-json');
    return nothing();
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.statements)) { tally.bump('not-an-object'); return nothing(); }
  for (const [key, value] of Object.entries(parsed)) {
    if (key === 'statements') continue;
    tally.bump('unexpected-field', Array.isArray(value) ? Math.max(1, value.length) : 1);
  }

  const accepted: ProposedStatement[] = [];
  const seen = new Set<string>();
  for (const entry of parsed.statements) {
    if (accepted.length >= MAX_STATEMENTS) { tally.bump('too-many'); continue; }
    const result = validateEntry(context, entry, tally);
    if (typeof result === 'string') { tally.bump(result); continue; }
    const key = `${result.text}@${result.anchors.map((a) => `${a.file}:${a.lineStart}`).join(',')}`;
    if (seen.has(key)) { tally.bump('duplicate'); continue; }
    seen.add(key);
    accepted.push({ id: `M${accepted.length + 1}`, ...result });
  }
  return { statements: accepted, discarded: tally.result() };
}
