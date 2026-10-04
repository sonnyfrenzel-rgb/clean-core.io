import { test, expect } from '@playwright/test';
import {
  parseModelJsonObject,
  repairStringEscapes,
  retryNotice,
  unusableAnswerMessage,
  unusableFromModelError,
  type UnusableAnswer,
} from '../lib/model-json';
import { TESTING_RESPONSE_SCHEMA, TRANSFORMATION_RESPONSE_SCHEMA, responseSchemaForStage } from '../lib/model-response-schema';
import { parseScenarioOrigin } from '../lib/scenario-origin';
import { checkTestSuiteShape } from '../app/(app)/project/[projectId]/testing/test-suite-schema';

/**
 * Reading a model answer as a JSON object (owner report 03.10.2026: the
 * Transformation stage failed on a complete answer that carried the ABAP
 * escape `\{` inside a JSON string, and passed on the second try).
 *
 * Pure: no model, no browser.
 */

const PACKAGE = {
  files: [{ path: 'srv/service.ts', content: 'export const a = 1;\n' }],
  tests: { config: 'c', spec: 's' },
};
const JSON_TEXT = JSON.stringify(PACKAGE, null, 2);

test.describe('parseModelJsonObject', () => {
  test('a plain JSON object is read as it is, with nothing tolerated', () => {
    const r = parseModelJsonObject(JSON_TEXT);
    expect(r).toEqual({ ok: true, value: PACKAGE, tolerated: [] });
  });

  test('a fenced JSON answer is accepted', () => {
    const r = parseModelJsonObject('```json\n' + JSON_TEXT + '\n```');
    expect(r.ok && r.value).toEqual(PACKAGE);
    expect(r.ok && r.tolerated).toEqual(['fence']);
    // A fence without a language tag, too.
    expect(parseModelJsonObject('```\n' + JSON_TEXT + '\n```').ok).toBe(true);
  });

  test('prose around valid JSON is accepted', () => {
    const r = parseModelJsonObject(`Here is the package you asked for {as promised}:\n\n${JSON_TEXT}\n\nLet me know if you need more.`);
    expect(r.ok && r.value).toEqual(PACKAGE);
    expect(r.ok && r.tolerated).toEqual(['surrounding-text']);
  });

  test('a brace inside a string does not end the object', () => {
    const value = { files: [{ path: 'a.ts', content: 'if (x) { return "}"; }' }], tests: { config: '{', spec: '}' } };
    const r = parseModelJsonObject(`Answer: ${JSON.stringify(value)} done`);
    expect(r.ok && r.value).toEqual(value);
  });

  test('the ABAP escape \\{ inside a string is read as the literal backslash the source holds', () => {
    // As the model wrote it on 03.10.2026: `\{` raw inside a JSON string.
    const raw = '{"files":[{"path":"z.clas.abap","content":"lv_payload = |\\{ \\"banfn\\": \\"{ iv_banfn }\\" \\}|."}],"tests":{"config":"c","spec":"s"}}';
    expect(() => JSON.parse(raw)).toThrow(/escaped character/);
    const r = parseModelJsonObject(raw);
    expect(r.ok).toBe(true);
    expect(r.ok && r.tolerated).toEqual(['escapes']);
    const content = r.ok ? (r.value.files as Array<{ content: string }>)[0].content : '';
    expect(content).toBe('lv_payload = |\\{ "banfn": "{ iv_banfn }" \\}|.');
  });

  test('a raw control character inside a string is escaped, not dropped', () => {
    const raw = '{"files":[{"path":"a.ts","content":"line1\nline2\tx"}],"tests":{"config":"c","spec":"s"}}';
    const r = parseModelJsonObject(raw);
    expect(r.ok && (r.value.files as Array<{ content: string }>)[0].content).toBe('line1\nline2\tx');
  });

  test('a truncated answer is unbalanced, not prose', () => {
    expect(parseModelJsonObject(JSON_TEXT.slice(0, JSON_TEXT.length - 20))).toEqual({ ok: false, reason: 'unbalanced' });
    // Cut off inside a fence whose closing fence never came.
    expect(parseModelJsonObject('```json\n' + JSON_TEXT.slice(0, 40))).toEqual({ ok: false, reason: 'unbalanced' });
  });

  test('invalid JSON is not-json (prose), and so is a refusal', () => {
    expect(parseModelJsonObject('{"files": [ oops ], "tests": nope}')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseModelJsonObject('I cannot help with transforming this program.')).toEqual({ ok: false, reason: 'not-json' });
  });

  test('a JSON value that is not a plain object is refused', () => {
    expect(parseModelJsonObject('[1,2,3]')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseModelJsonObject('"just a string"')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseModelJsonObject('null')).toEqual({ ok: false, reason: 'not-json' });
  });

  test('an empty answer is empty', () => {
    expect(parseModelJsonObject('')).toEqual({ ok: false, reason: 'empty' });
    expect(parseModelJsonObject('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(parseModelJsonObject(undefined)).toEqual({ ok: false, reason: 'empty' });
  });

  test('nothing outside strings is changed by the escape repair', () => {
    expect(repairStringEscapes('{"a":"\\{","b":[1, 2]}')).toBe('{"a":"\\\\{","b":[1, 2]}');
    expect(repairStringEscapes('{"a":"\\n\\"\\u00e9"}')).toBe('{"a":"\\n\\"\\u00e9"}');
  });
});

test.describe('retry and messages', () => {
  test('only a cut-off or empty answer from the proxy is retried; a filter block or other refusal is not', () => {
    expect(unusableFromModelError({ code: 'model-incomplete', reason: 'truncated' })).toBe('truncated');
    expect(unusableFromModelError({ code: 'model-incomplete', reason: 'empty' })).toBe('empty');
    expect(unusableFromModelError({ code: 'model-incomplete', reason: 'unfinished' })).toBe('unbalanced');
    expect(unusableFromModelError({ code: 'model-incomplete', reason: 'filtered' })).toBeNull();
    expect(unusableFromModelError({ code: 'stage-disabled' })).toBeNull();
    expect(unusableFromModelError(new Error('Too many requests.'))).toBeNull();
    expect(unusableFromModelError(null)).toBeNull();
  });

  const reasons: UnusableAnswer[] = ['truncated', 'unbalanced', 'empty', 'not-json'];
  for (const reason of reasons) {
    test(`the ${reason} message keeps "Nothing was saved" and never calls the answer "text instead of"`, () => {
      for (const attempts of [1, 2]) {
        const m = unusableAnswerMessage(reason, attempts);
        expect(m).toContain('Nothing was saved — the previous version is untouched.');
        expect(m).not.toMatch(/text instead of/i);
      }
      expect(retryNotice(reason)).toMatch(/Retrying once — a second model call/);
    });
  }

  test('a cut-off answer is said to be cut off at the length limit; prose is said to be prose', () => {
    expect(unusableAnswerMessage('truncated', 2)).toMatch(/^The answer was cut off at the model's length limit/);
    expect(unusableAnswerMessage('truncated', 2)).toMatch(/both attempts/);
    expect(unusableAnswerMessage('not-json', 1)).toMatch(/^The model returned prose .* Try again\.$/);
  });
});

test.describe('the Transformation response schema', () => {
  test('is sent for the transformation stage, the testing stage has its own, the others none', () => {
    expect(responseSchemaForStage('transformation')).toBe(TRANSFORMATION_RESPONSE_SCHEMA);
    expect(responseSchemaForStage('testing')).toBe(TESTING_RESPONSE_SCHEMA);
    for (const stage of ['analyze', 'naming', 'statements', 'design', 'documentation'] as const) {
      expect(responseSchemaForStage(stage)).toBeUndefined();
    }
    expect(responseSchemaForStage(undefined)).toBeUndefined();
  });

  test('requires exactly the shape the page validates', () => {
    expect(TRANSFORMATION_RESPONSE_SCHEMA.required).toEqual(['files', 'tests']);
    expect(TRANSFORMATION_RESPONSE_SCHEMA.properties.files.items.required).toEqual(['path', 'content']);
    expect(TRANSFORMATION_RESPONSE_SCHEMA.properties.tests.required).toEqual(['config', 'spec']);
  });
});

/**
 * The Testing stage, brought to the same standard (its answer carries the test
 * class or test file inside a JSON string, so the same `\{` can appear).
 */
test.describe('the Testing response schema and messages', () => {
  test('requires the four fields the hook stores, and the fields the page reads', () => {
    expect(TESTING_RESPONSE_SCHEMA.required).toEqual(['testCases', 'testSuite', 'manualTestingRequirements', 'coverageEstimate']);
    expect(TESTING_RESPONSE_SCHEMA.properties.testCases.items.required).toEqual(['id', 'name', 'category', 'description', 'priority']);
    expect(TESTING_RESPONSE_SCHEMA.properties.testSuite.required).toEqual(['code']);
    expect(TESTING_RESPONSE_SCHEMA.properties.manualTestingRequirements.items.required).toEqual(['area', 'reason', 'verificationSteps']);
    expect(TESTING_RESPONSE_SCHEMA.properties.coverageEstimate.required).toEqual(['percentage', 'explanation', 'missingCoverage']);
    // `derivedFrom` stays optional: the prompt says to leave it out rather than guess.
    expect(TESTING_RESPONSE_SCHEMA.properties.testCases.items.required).not.toContain('derivedFrom');
  });

  test('an answer of the schema shape passes the shape check, and its string lines are read by the origin parser', () => {
    const answer = {
      testCases: [{
        id: 'TC_01', name: 'n', category: 'Unit', description: 'd', priority: 'High',
        steps: ['a'], validationPoints: ['b'],
        derivedFrom: { kind: 'rule', ref: 'BR-009', lines: ['412', '412-414'], quote: 'IF x.' },
      }],
      testSuite: { code: 'lv = |\\{ x \\}|.' },
      manualTestingRequirements: [{ area: 'a', reason: 'r', verificationSteps: ['s'] }],
      coverageEstimate: { percentage: 70, explanation: 'e', missingCoverage: 'm' },
    };
    expect(checkTestSuiteShape(answer)).toEqual({ ok: true, problems: [] });
    const origin = parseScenarioOrigin(answer.testCases[0].derivedFrom);
    expect(origin.state).toBe('stated');
    expect(origin.state === 'stated' && origin.origin.lines).toEqual([{ start: 412, end: 412 }, { start: 412, end: 414 }]);
  });

  test('a test class with the ABAP escape \\{ is read, its text intact', () => {
    const raw = '{"testCases":[{"id":"TC_01","name":"n","category":"Unit","description":"d","priority":"High"}],"testSuite":{"code":"lv_json = |\\{ \\"a\\": 1 \\}|."},"manualTestingRequirements":[],"coverageEstimate":{"percentage":1,"explanation":"e","missingCoverage":"m"}}';
    expect(() => JSON.parse(raw)).toThrow(/escaped character/);
    const r = parseModelJsonObject(raw);
    expect(r.ok && (r.value.testSuite as { code: string }).code).toBe('lv_json = |\\{ "a": 1 \\}|.');
  });

  test('the messages name a test suite, not a package, and keep "Nothing was saved"', () => {
    for (const reason of ['truncated', 'unbalanced', 'empty', 'not-json'] as const) {
      const m = unusableAnswerMessage(reason, 2, 'test suite');
      expect(m).toContain('Nothing was saved — the previous version is untouched.');
      expect(m).not.toMatch(/package/);
      expect(retryNotice(reason, 'test suite')).not.toMatch(/package/);
    }
    expect(unusableAnswerMessage('not-json', 1, 'test suite')).toMatch(/^The model returned prose instead of the JSON test suite this stage asked for\./);
    // The default is still the Transformation stage's word.
    expect(unusableAnswerMessage('not-json', 1)).toContain('JSON package');
  });
});
