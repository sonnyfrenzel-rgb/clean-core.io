/**
 * Reading an ABAP Unit result file from the reader's own SAP system.
 *
 * Owner decision 03.10.2026: on the ABAP Cloud route nothing here runs ABAP
 * Unit (`lib/test-runnability.ts`), so the result has to come from the system
 * that ran it. Two forms are read, both XML:
 *
 *   - **JUnit XML** — `<testsuites>`/`<testsuite>` with `<testcase>` and its
 *     `<failure>`, `<error>` or `<skipped>`. This is what CI tooling writes for
 *     ABAP Unit (abapGit CI, `abap-ci`, SAP Piper's `abapEnvironmentRunAUnitTest`),
 *     and what the ADT REST service `/sap/bc/adt/abapunit/testruns` answers when
 *     it is asked for `application/vnd.sap.adt.api.junit.run-result.v1+xml`:
 *     one `testcase` per test method, `name` the method, `classname` the class.
 *   - **The ADT ABAP Unit run result** — `<aunit:runResult>` with `program` →
 *     `testClasses` → `testClass` → `testMethods` → `testMethod adtcore:name`,
 *     and `alerts` → `alert kind severity` → `title`. This is ADT's own answer
 *     to the same service in its default form, and what the Eclipse ABAP Unit
 *     runner reads. A method with a `critical` or `fatal` alert failed; a
 *     `tolerable` alert is a warning and the method passed.
 *
 * **Not a general XML parser, on purpose** (owner, 03.10.2026: "the upload must
 * not create a new security hole"). It reads the subset these two formats use
 * and refuses everything declarative before it reads a value:
 *
 *   - any `<!` that is not a comment or CDATA — `<!DOCTYPE`, `<!ENTITY`,
 *     `<!ELEMENT` — is refused, so there is no DTD, no external entity and no
 *     entity expansion (XXE, billion laughs);
 *   - only the five predefined entities and numeric character references are
 *     decoded; any other `&name;` stays literal text and expands to nothing;
 *   - the file, the number of elements, the nesting depth, the number of
 *     attributes and the number of test cases are capped, and every kept string
 *     is cut to a fixed length with control and bidirectional-override
 *     characters removed.
 *
 * Nothing is evaluated, fetched or written: input is a string, output is a
 * plain object. The route stores only the bounded fields this returns, never
 * the file.
 *
 * Pure, no imports beyond the matching rule.
 */

import { abapIdWeight, abapMethodMatches } from './abap-unit-method';

/** The file, as UTF-8 bytes. A result file of one test class is a few kilobytes. */
export const MAX_RESULT_FILE_BYTES = 1_000_000;
/** Test cases (methods) read from one file. */
export const MAX_RESULT_TESTCASES = 2_000;
/** Elements of any kind in one file. */
export const MAX_RESULT_ELEMENTS = 40_000;
/** Nesting depth. JUnit needs three levels, the ADT result about eight. */
export const MAX_RESULT_DEPTH = 32;
/** Attributes on one element. */
export const MAX_RESULT_ATTRIBUTES = 32;
/** A test or class name as kept. */
export const MAX_RESULT_NAME_CHARS = 200;
/** A failure message as kept. Stack text beyond it is dropped. */
export const MAX_RESULT_MESSAGE_CHARS = 300;
/** The uploaded file's name as kept. */
export const MAX_RESULT_FILE_NAME_CHARS = 120;
/** How many unmatched test names a record lists; the rest is counted. */
export const MAX_UNMATCHED_LISTED = 100;

export type TestCaseOutcome = 'passed' | 'failed' | 'skipped';
export type ResultFileFormat = 'junit' | 'aunit';

export interface ParsedTestCase {
  /** The test method as the file names it. */
  name: string;
  /** The test class, where the file names one. */
  className: string | null;
  outcome: TestCaseOutcome;
  /** The failure's first line, bounded; null for a pass. */
  message: string | null;
}

export type ParseRefusal =
  | 'empty'
  | 'too-large'
  | 'dtd-refused'
  | 'not-xml'
  | 'unknown-format'
  | 'too-many-elements'
  | 'too-deep'
  | 'too-many-tests'
  | 'no-tests';

export type ParseResult =
  | { ok: true; format: ResultFileFormat; cases: ParsedTestCase[] }
  | { ok: false; code: ParseRefusal; error: string };

const REFUSAL_TEXT: Record<ParseRefusal, string> = {
  empty: 'The file is empty.',
  'too-large': `The file is larger than ${MAX_RESULT_FILE_BYTES / 1_000_000} MB. A result file of one test class is a few kilobytes — export the run of this class only.`,
  'dtd-refused': 'The file declares a DTD or entities. ABAP Unit result files never do, so it is not read.',
  'not-xml': 'The file is not well-formed XML.',
  'unknown-format': 'This is not a JUnit or ABAP Unit result file. Its root element must be <testsuites>, <testsuite> or <aunit:runResult>.',
  'too-many-elements': `The file has more than ${MAX_RESULT_ELEMENTS} elements, more than a result file of one test class holds.`,
  'too-deep': `The file nests deeper than ${MAX_RESULT_DEPTH} levels, which no result file does.`,
  'too-many-tests': `The file holds more than ${MAX_RESULT_TESTCASES} test methods. Export the run of this test class only.`,
  'no-tests': 'The file holds no test methods.',
};

function refuse(code: ParseRefusal): ParseResult {
  return { ok: false, code, error: REFUSAL_TEXT[code] };
}

/**
 * Text as kept: control characters and bidirectional overrides removed,
 * whitespace collapsed, cut to `max` characters. Never interpreted as markup —
 * every reader renders it as text.
 */
export function boundedText(raw: string, max: number): string {
  const cleaned = raw
    // C0 controls (newline and tab become spaces below), DEL, C1 controls,
    // and the bidi controls that can make a name read as something else.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/** Bytes of `text` as UTF-8 — the same count on the server and in the browser. */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The base name of an uploaded file, bounded. */
export function boundedFileName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : '';
  const base = text.split(/[\\/]/).pop() ?? '';
  return boundedText(base, MAX_RESULT_FILE_NAME_CHARS) || 'result.xml';
}

/** The five predefined entities and numeric references. Anything else stays literal. */
function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]{1,6}|#[0-9]{1,7}|lt|gt|amp|quot|apos);/g, (whole, ref: string) => {
    switch (ref) {
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'amp':
        return '&';
      case 'quot':
        return '"';
      case 'apos':
        return "'";
    }
    const code = ref.startsWith('#x') ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
    if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return whole;
    return String.fromCodePoint(code);
  });
}

const NAME = /^[A-Za-z_][\w.:-]*/;
const ATTRIBUTE = /([A-Za-z_][\w.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** `aunit:runResult` → `runResult`. */
const local = (name: string) => {
  const i = name.lastIndexOf(':');
  return i === -1 ? name : name.slice(i + 1);
};

interface Handlers {
  open(name: string, attrs: Record<string, string>, depth: number): ParseRefusal | void;
  close(name: string, depth: number): void;
  text(text: string): void;
}

/**
 * One pass over the document: start tags, end tags and text, checked for
 * nesting. Comments and processing instructions are skipped; CDATA is text;
 * every other `<!` is refused.
 */
function scan(xml: string, h: Handlers): ParseRefusal | null {
  const stack: string[] = [];
  let elements = 0;
  let sawRoot = false;
  let i = 0;
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf('<', i);
    if (lt === -1) {
      if (stack.length > 0) h.text(decodeEntities(xml.slice(i)));
      break;
    }
    if (lt > i && stack.length > 0) h.text(decodeEntities(xml.slice(i, lt)));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end === -1) return 'not-xml';
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end === -1) return 'not-xml';
      if (stack.length > 0) h.text(xml.slice(lt + 9, end));
      i = end + 3;
      continue;
    }
    // Every other declaration: DOCTYPE, ENTITY, ELEMENT, ATTLIST, NOTATION.
    if (xml.startsWith('<!', lt)) return 'dtd-refused';
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end === -1) return 'not-xml';
      i = end + 2;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt + 2);
      if (end === -1) return 'not-xml';
      const name = xml.slice(lt + 2, end).trim();
      if (stack.length === 0 || stack[stack.length - 1] !== name) return 'not-xml';
      stack.pop();
      h.close(local(name), stack.length);
      i = end + 1;
      continue;
    }
    // A start tag: to the first `>` outside a quoted attribute value.
    let j = lt + 1;
    let quote: string | null = null;
    while (j < n) {
      const c = xml[j];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      } else if (c === '<') {
        return 'not-xml';
      }
      j++;
    }
    if (j >= n) return 'not-xml';
    let inner = xml.slice(lt + 1, j);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const nameMatch = NAME.exec(inner);
    if (!nameMatch) return 'not-xml';
    const name = nameMatch[0];
    if (stack.length === 0 && sawRoot) return 'not-xml';
    sawRoot = true;
    elements++;
    if (elements > MAX_RESULT_ELEMENTS) return 'too-many-elements';
    if (stack.length + 1 > MAX_RESULT_DEPTH) return 'too-deep';
    const attrs: Record<string, string> = Object.create(null);
    let count = 0;
    for (const m of inner.slice(name.length).matchAll(ATTRIBUTE)) {
      if (++count > MAX_RESULT_ATTRIBUTES) break;
      attrs[local(m[1])] = decodeEntities(m[2] ?? m[3] ?? '');
    }
    const refusal = h.open(local(name), attrs, stack.length);
    if (refusal) return refusal;
    if (selfClosing) {
      h.close(local(name), stack.length);
    } else {
      stack.push(name);
    }
    i = j + 1;
  }
  if (!sawRoot || stack.length > 0) return 'not-xml';
  return null;
}

/**
 * Parse a result file. `xml` is the file as text; its size is checked here as
 * well as before the request is read, so the function is safe on its own.
 */
export function parseTestResultFile(xml: unknown): ParseResult {
  if (typeof xml !== 'string' || !xml.trim()) return refuse('empty');
  if (utf8Length(xml) > MAX_RESULT_FILE_BYTES) return refuse('too-large');
  const head = xml.replace(/^﻿/, '');

  let format: ResultFileFormat | null = null;
  const cases: ParsedTestCase[] = [];
  /** The case being read: JUnit `testcase` or ADT `testMethod`. */
  let current: (ParsedTestCase & { depth: number }) | null = null;
  /** ADT: the class the methods belong to. */
  let aunitClass: string | null = null;
  /** Text being collected for a message, and the depth of the element it belongs to. */
  let collecting: { depth: number; text: string } | null = null;

  const startMessage = (depth: number, attrMessage: string | undefined) => {
    if (!current || current.message) return;
    if (attrMessage && attrMessage.trim()) {
      current.message = boundedText(attrMessage, MAX_RESULT_MESSAGE_CHARS);
    } else {
      collecting = { depth, text: '' };
    }
  };

  const refusal = scan(head, {
    open(name, attrs, depth) {
      if (depth === 0) {
        if (name === 'testsuites' || name === 'testsuite') format = 'junit';
        else if (name === 'runResult') format = 'aunit';
        else return 'unknown-format';
      }
      if (format === 'junit') {
        if (name === 'testcase') {
          if (cases.length >= MAX_RESULT_TESTCASES) return 'too-many-tests';
          current = {
            name: boundedText(attrs.name ?? '', MAX_RESULT_NAME_CHARS),
            className: attrs.classname ? boundedText(attrs.classname, MAX_RESULT_NAME_CHARS) : null,
            outcome: 'passed',
            message: null,
            depth,
          };
          return;
        }
        if (current && (name === 'failure' || name === 'error')) {
          current.outcome = 'failed';
          startMessage(depth, attrs.message);
          return;
        }
        if (current && name === 'skipped') {
          if (current.outcome !== 'failed') current.outcome = 'skipped';
          if (!current.message && attrs.message) current.message = boundedText(attrs.message, MAX_RESULT_MESSAGE_CHARS);
        }
        return;
      }
      // ADT ABAP Unit run result.
      if (name === 'testClass') {
        aunitClass = attrs.name ? boundedText(attrs.name, MAX_RESULT_NAME_CHARS) : null;
        return;
      }
      if (name === 'testMethod') {
        if (cases.length >= MAX_RESULT_TESTCASES) return 'too-many-tests';
        current = {
          name: boundedText(attrs.name ?? '', MAX_RESULT_NAME_CHARS),
          className: aunitClass,
          outcome: 'passed',
          message: null,
          depth,
        };
        return;
      }
      if (current && name === 'alert') {
        const severity = (attrs.severity ?? '').toLowerCase();
        if (severity === 'critical' || severity === 'fatal') current.outcome = 'failed';
        return;
      }
      if (current && current.outcome === 'failed' && name === 'title') {
        startMessage(depth, undefined);
      }
    },
    close(name, depth) {
      if (collecting && depth === collecting.depth) {
        if (current && !current.message && collecting.text.trim()) {
          current.message = boundedText(collecting.text, MAX_RESULT_MESSAGE_CHARS);
        }
        collecting = null;
      }
      if (current && depth === current.depth && (name === 'testcase' || name === 'testMethod')) {
        const { depth: _depth, ...done } = current;
        void _depth;
        if (done.outcome === 'passed') done.message = null;
        cases.push(done);
        current = null;
      }
      if (name === 'testClass') aunitClass = null;
    },
    text(text) {
      // Collected only for a message, and never beyond what is kept.
      if (collecting && collecting.text.length < MAX_RESULT_MESSAGE_CHARS * 2) {
        collecting.text += text.slice(0, MAX_RESULT_MESSAGE_CHARS * 2 - collecting.text.length);
      }
    },
  });
  if (refusal) return refuse(refusal);
  if (!format) return refuse('unknown-format');
  if (cases.length === 0) return refuse('no-tests');
  return { ok: true, format, cases };
}

/**
 * The method a test case names. JUnit writers differ: most put the method in
 * `name` and the class in `classname`; some write `CLASS=>METHOD`,
 * `CLASS->METHOD` or `CLASS.METHOD` into `name`. The method is the last part.
 */
export function methodOfTestName(name: string): string {
  const parts = name.split(/=>|->|[.:\s]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : name;
}

export type ScenarioOutcome = TestCaseOutcome | 'none';

export interface ScenarioResult {
  /** The scenario id, as the project holds it. */
  id: string;
  /**
   * `failed` when any of its test methods failed, `passed` when at least one
   * passed and none failed, `skipped` when every one was skipped, `none` when
   * the file holds no method for it.
   */
  outcome: ScenarioOutcome;
  /** How many test methods of the file belong to it. */
  tests: number;
  /** The first failure's message, bounded. */
  message: string | null;
}

export interface UnmatchedTest {
  name: string;
  outcome: TestCaseOutcome;
}

export interface MatchResult {
  /** One per scenario, in the project's order. */
  results: ScenarioResult[];
  /** Test methods that are not one of the scenarios — listed up to `MAX_UNMATCHED_LISTED`. */
  unmatched: UnmatchedTest[];
  unmatchedTotal: number;
  totals: { tests: number; passed: number; failed: number; skipped: number };
}

/**
 * Give each scenario its result. A test method belongs to the scenario whose id
 * its name refers to (`abapMethodMatches`, the rule the Testing stage uses to
 * find the method in the generated class); where two ids match — `TC_1` and
 * `TC_1_A` — the longer, more specific one takes it.
 */
export function matchToScenarios(cases: readonly ParsedTestCase[], scenarioIds: readonly string[]): MatchResult {
  const ids = scenarioIds.map((id) => String(id ?? ''));
  const per = ids.map((id) => ({ id, passed: 0, failed: 0, skipped: 0, message: null as string | null }));
  const unmatched: UnmatchedTest[] = [];
  let unmatchedTotal = 0;
  const totals = { tests: cases.length, passed: 0, failed: 0, skipped: 0 };

  for (const c of cases) {
    totals[c.outcome]++;
    const method = methodOfTestName(c.name);
    let best = -1;
    let bestWeight = -1;
    ids.forEach((id, index) => {
      if (!id || !abapMethodMatches(method, id)) return;
      const weight = abapIdWeight(id);
      if (weight > bestWeight) {
        best = index;
        bestWeight = weight;
      }
    });
    if (best === -1) {
      unmatchedTotal++;
      if (unmatched.length < MAX_UNMATCHED_LISTED) unmatched.push({ name: c.name || '(no name)', outcome: c.outcome });
      continue;
    }
    // Every scenario that carries this id gets it — a duplicated id is the
    // model's mistake, not a reason to give one of the two no result.
    ids.forEach((id, index) => {
      if (id !== ids[best]) return;
      const p = per[index];
      p[c.outcome]++;
      if (c.outcome === 'failed' && !p.message) p.message = c.message;
    });
  }

  const results: ScenarioResult[] = per.map((p) => {
    const tests = p.passed + p.failed + p.skipped;
    const outcome: ScenarioOutcome = tests === 0 ? 'none' : p.failed > 0 ? 'failed' : p.passed > 0 ? 'passed' : 'skipped';
    return { id: p.id, outcome, tests, message: outcome === 'failed' ? p.message : null };
  });
  return { results, unmatched, unmatchedTotal, totals };
}
