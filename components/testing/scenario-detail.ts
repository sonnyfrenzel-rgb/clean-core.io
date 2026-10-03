/**
 * What one test scenario holds, and where it can be tested — read from what the
 * testing model stored and nothing else.
 *
 * Pure and without React, so the Testing stage and a spec read the same rule.
 *
 * Owner (03.10.2026, translated): "You must be able to look at the details of
 * the test scenarios, and it must always be clear what we can test and what only
 * works outside." Two things follow, and both are held to what is on record:
 *
 *  1. **The details.** Every field the scenario carries, in words. A field the
 *     model left out says "not stated by the model" — it is never filled in, and
 *     an empty string is the same absence as a missing key. Fields the prompt
 *     does not ask for but the model wrote anyway are shown too, under their own
 *     key, because hiding stored data is as wrong as inventing it.
 *
 *  2. **The scope.** Where a scenario can be tested is derived from two facts
 *     the project holds, never from the scenario's wording:
 *
 *       - the route. On the ABAP Cloud route the suite is an ABAP Unit class,
 *         and nothing here runs ABAP (`lib/test-runnability.ts`) — every
 *         scenario needs the reader's own SAP system;
 *       - on the other routes, whether the stored suite holds a test the runner
 *         can attribute to the scenario. The runner reads a test's id as the
 *         first token of its title, up to a colon, space or `#`
 *         (`parseTapOutput`), and gives a scenario a verdict only when that id
 *         equals the scenario's. With such a test the scenario can be
 *         demonstrated here against mocks; without one a run reports it "Not
 *         run", so where it can be tested is *not determined*.
 *
 *     Reading "authorisation" or "BAPI" out of a scenario's text and sorting it
 *     by keyword would be a guess dressed as a category; that is exactly what
 *     the owner's rule forbids, so it is not done.
 */

import { abapMethodMatches } from '@/lib/abap-unit-method';

/** The one matching rule, shared with the import of a result file from the reader's SAP system. */
export { abapMethodMatches };

/** Where a scenario can be tested. */
export type ScenarioScope = 'here-mock' | 'your-system' | 'not-determined';

/** What the stage says for a missing field — the one wording, everywhere. */
export const NOT_STATED = 'Not stated by the model';

/** One field of a scenario as the details show it. */
export interface ScenarioField {
  key: string;
  label: string;
  /** Null when the model did not state it. A list keeps its items apart. */
  value: string | string[] | null;
}

/** The fields the testing prompt asks for, in reading order, with the words the details use. */
const ASKED: ReadonlyArray<{ key: string; label: string; alternatives?: string[] }> = [
  { key: 'category', label: 'Type' },
  { key: 'priority', label: 'Priority' },
  { key: 'description', label: 'What it checks' },
  { key: 'preconditions', label: 'Preconditions' },
  { key: 'testData', label: 'Test data and inputs', alternatives: ['inputs', 'input', 'testInput', 'testInputs'] },
  { key: 'steps', label: 'Steps' },
  { key: 'expectedResult', label: 'Expected result' },
  { key: 'validationPoints', label: 'Validation points' },
];

/**
 * Keys under which a model may name what the scenario derives from. Since the
 * owner decision of 03.10.2026 the prompt asks for a structured `derivedFrom`
 * (`lib/scenario-origin.ts`), which is validated and checked against the
 * source. The other keys are what scenarios stored before that may carry: free
 * text, shown with any line numbers in it read as anchors, and never checked.
 */
const DERIVED_FROM_KEYS = [
  'derivedFrom',
  'businessRule',
  'rule',
  'ruleId',
  'finding',
  'findingId',
  'requirement',
  'requirementId',
  'sourceLines',
  'sourceLine',
  'lines',
  'lineRange',
] as const;

/** Keys the details show elsewhere, or that are not the scenario's content. */
const NOT_A_FIELD = new Set(['id', 'name', 'status', 'message', 'derivedFromCheck', 'derivedFromDropped']);

/** Any stored value as text, or null when it says nothing. Objects become JSON, never `[object Object]`. */
export function textOf(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim() ? value.trim() : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    const json = JSON.stringify(value);
    return json && json !== '{}' && json !== '[]' ? json : null;
  } catch {
    return String(value);
  }
}

/** A stored value as one text or a list of texts — a list stays a list. */
function valueOf(raw: unknown): string | string[] | null {
  if (Array.isArray(raw)) {
    const items = raw.map(textOf).filter((t): t is string => t !== null);
    return items.length > 0 ? items : null;
  }
  return textOf(raw);
}

/** "testData" → "Test data", "businessRule" → "Business rule". */
function labelOfKey(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}

/**
 * The fields of a scenario, as stored. The asked-for ones always appear — a
 * missing one with `value: null` — so a reader sees what the model left out;
 * anything else it wrote follows under its own key.
 */
export function scenarioFields(tc: Record<string, unknown> | null | undefined): ScenarioField[] {
  const record = tc && typeof tc === 'object' ? tc : {};
  const used = new Set<string>();
  const fields: ScenarioField[] = ASKED.map(({ key, label, alternatives }) => {
    used.add(key);
    let value = valueOf(record[key]);
    for (const alt of alternatives ?? []) {
      used.add(alt);
      if (value === null) value = valueOf(record[alt]);
    }
    return { key, label, value };
  });
  for (const key of DERIVED_FROM_KEYS) used.add(key);
  for (const [key, raw] of Object.entries(record)) {
    if (used.has(key) || NOT_A_FIELD.has(key)) continue;
    const value = valueOf(raw);
    if (value !== null) fields.push({ key, label: labelOfKey(key), value });
  }
  return fields;
}

/** What the scenario says it derives from, if the model wrote it — text and the line anchors in it. */
export interface DerivedFrom {
  text: string;
  /** `L243`, `L380-412` — read from the text, in order, without repeats. */
  anchors: string[];
}

export function derivedFrom(tc: Record<string, unknown> | null | undefined): DerivedFrom | null {
  if (!tc || typeof tc !== 'object') return null;
  const parts: string[] = [];
  for (const key of DERIVED_FROM_KEYS) {
    // A structured `derivedFrom` is the checked statement, read by `readScenarioOrigin` — not free text.
    if (key === 'derivedFrom' && tc[key] !== null && typeof tc[key] === 'object') continue;
    const value = valueOf(tc[key]);
    if (value === null) continue;
    parts.push(...(Array.isArray(value) ? value : [value]));
  }
  if (parts.length === 0) return null;
  const text = parts.join(' · ');
  const anchors: string[] = [];
  // "L243", "L380-412", "line 243", "lines 380-412", "380–412" after "lines".
  const pattern = /\b(?:L|lines?\s+)(\d{1,6})(?:\s*[-–]\s*L?(\d{1,6}))?\b/gi;
  for (const m of text.matchAll(pattern)) {
    const anchor = m[2] ? `L${m[1]}-${m[2]}` : `L${m[1]}`;
    if (!anchors.includes(anchor)) anchors.push(anchor);
  }
  return { text, anchors };
}

/** The generated test of one scenario, as it stands in the stored suite. */
export type ScenarioTest =
  | {
      kind: 'found';
      /** The method or the test title. */
      name: string;
      /** 1-based line of the suite the test starts on. */
      startLine: number;
      code: string;
    }
  | { kind: 'not-found'; reason: string }
  | { kind: 'no-suite'; reason: string };

/** The test id the runner reads off a `node:test` title: the first token, up to a colon, space or `#`. */
export function runnerIdOfTitle(title: string): string {
  const m = title.trim().match(/^([^\s:#]+)/);
  return m ? m[1] : '';
}

function lineOfOffset(text: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

/** The ABAP Unit method of a scenario: its `METHOD name.` to its `ENDMETHOD.` in the implementation. */
function abapTestOf(code: string, id: string): ScenarioTest {
  const methodLine = /^[ \t]*METHOD[ \t]+([\w/~]+)[ \t]*\./gim;
  for (const m of code.matchAll(methodLine)) {
    if (!abapMethodMatches(m[1], id)) continue;
    const start = m.index ?? 0;
    const endMatch = /^[ \t]*ENDMETHOD[ \t]*\./gim;
    endMatch.lastIndex = start;
    const end = endMatch.exec(code);
    const stop = end ? end.index + end[0].length : code.length;
    return { kind: 'found', name: m[1], startLine: lineOfOffset(code, start), code: code.slice(start, stop).replace(/^[ \t]*\n/, '') };
  }
  return {
    kind: 'not-found',
    reason: `The test class has no method whose name refers to ${id}, so the scenario cannot be matched to its test code.`,
  };
}

/**
 * The end of a `test(...)` call: the `)` that closes the bracket opened at
 * `open`, skipping strings, template literals and comments. -1 when unbalanced.
 */
function closingParen(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const endComment = code.indexOf('*/', i + 2);
      i = endComment === -1 ? code.length : endComment + 1;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The `node:test` test of a scenario: the `test(…)`/`it(…)` whose title's id is the scenario's. */
function nodeTestOf(code: string, id: string): ScenarioTest {
  const call = /\b(?:test|it)(?:\.(?:only|skip|todo))?\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;
  for (const m of code.matchAll(call)) {
    if (runnerIdOfTitle(m[2]) !== id) continue;
    const start = m.index ?? 0;
    const open = code.indexOf('(', start);
    const close = closingParen(code, open);
    let stop = close === -1 ? code.length : close + 1;
    if (code[stop] === ';') stop++;
    return { kind: 'found', name: m[2], startLine: lineOfOffset(code, start), code: code.slice(start, stop) };
  }
  return {
    kind: 'not-found',
    reason: `The test suite has no test whose title starts with ${id}, so the scenario cannot be matched to its test code — and a run gives it no result.`,
  };
}

export function scenarioTest(suiteCode: unknown, id: unknown, abap: boolean): ScenarioTest {
  const key = textOf(id);
  if (typeof suiteCode !== 'string' || !suiteCode.trim()) {
    return { kind: 'no-suite', reason: abap ? 'No ABAP Unit class is stored for this project.' : 'No test suite is stored for this project.' };
  }
  if (!key) return { kind: 'not-found', reason: 'The scenario has no ID, so it cannot be matched to its test code.' };
  return abap ? abapTestOf(suiteCode, key) : nodeTestOf(suiteCode, key);
}

/** Where one scenario can be tested, and the reason in a sentence. */
export interface ScopeReading {
  scope: ScenarioScope;
  reason: string;
}

export function scenarioScope(test: ScenarioTest, abap: boolean): ScopeReading {
  if (abap) {
    return {
      scope: 'your-system',
      reason:
        'Its test is ABAP Unit. Nothing here compiles or runs ABAP, so it is tested in your own SAP system: copy the test class into ADT and run ABAP Unit.',
    };
  }
  if (test.kind === 'found') {
    return {
      scope: 'here-mock',
      reason:
        'The suite holds a test with this ID, so the isolated runner here can run it against mocks. A pass is demonstrated against mocks, not proof in your system.',
    };
  }
  return {
    scope: 'not-determined',
    reason:
      test.kind === 'no-suite'
        ? 'No test suite is stored, so where this scenario can be tested is not determined.'
        : 'The suite holds no test with this ID, so a run here gives it no result, and where it can be tested is not determined.',
  };
}

export interface ScopeCounts {
  'here-mock': number;
  'your-system': number;
  'not-determined': number;
}

export function countScopes(scopes: ReadonlyArray<ScenarioScope>): ScopeCounts {
  const counts: ScopeCounts = { 'here-mock': 0, 'your-system': 0, 'not-determined': 0 };
  for (const s of scopes) counts[s]++;
  return counts;
}

/** "4 can be demonstrated here (mock) · 6 need your SAP system" — the zero buckets left out. */
export function scopeSummary(c: ScopeCounts): string {
  const parts: string[] = [];
  if (c['here-mock'] > 0) parts.push(`${c['here-mock']} can be demonstrated here (mock)`);
  if (c['your-system'] > 0) parts.push(`${c['your-system']} ${c['your-system'] === 1 ? 'needs' : 'need'} your SAP system`);
  if (c['not-determined'] > 0) parts.push(`${c['not-determined']} not determined`);
  return parts.join(' · ');
}

/** The short word of a scope, as the row and the legend show it. */
export const SCOPE_WORD: Record<ScenarioScope, string> = {
  'here-mock': 'Here, mock run',
  'your-system': 'Your SAP system',
  'not-determined': 'Not determined',
};
