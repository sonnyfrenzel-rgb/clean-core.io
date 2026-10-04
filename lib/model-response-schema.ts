/**
 * The JSON schema a model stage hands to the provider with its request, where
 * the stage's answer has a fixed shape.
 *
 * Without a schema, Gemini's JSON mode (`responseMimeType: 'application/json'`)
 * is a request, not a grammar: on 03.10.2026 it returned a Transformation
 * answer that carried the ABAP escape `\{` inside a JSON string, which no JSON
 * parser accepts (`lib/model-json.ts` records the evidence). With a schema the
 * provider decodes against it, so the answer is a JSON object of this shape.
 *
 * Two stages have one: Transformation and Testing. Both answer with source
 * code inside JSON strings — the package, and the test class or test file —
 * which is where foreign escapes come from. Each schema asks for the shape its
 * stage validates and nothing more (Transformation: `isUsableFile`,
 * `missingArtefacts`, `usableTestSuite`; Testing: `checkTestSuiteShape` and the
 * origin check of `derivedFrom`). The stage's own validation still runs on
 * every answer, schema or not.
 *
 * Pure and import-free: the server route reads it, and the unit spec checks it
 * against the prompt's own structure.
 */

import type { ModelStage } from './model-stages';

/** `{ files: [{ path, content }], tests: { config, spec } }`, all strings, all required. */
export const TRANSFORMATION_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
    tests: {
      type: 'object',
      properties: {
        config: { type: 'string' },
        spec: { type: 'string' },
      },
      required: ['config', 'spec'],
    },
  },
  required: ['files', 'tests'],
} as const;

const STRING = { type: 'string' } as const;
const STRINGS = { type: 'array', items: STRING } as const;

/**
 * `{ testCases, testSuite: { code }, manualTestingRequirements, coverageEstimate }`
 * — the four fields the testing prompt asks for and the hook stores.
 *
 * `derivedFrom` is optional: the prompt tells the model to leave it out rather
 * than guess. Its `lines` are strings (`"412"`, `"412-414"`), which the origin
 * parser reads as it reads numbers (`lib/scenario-origin.ts`, `rangeOf`).
 */
export const TESTING_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    testCases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: STRING,
          name: STRING,
          category: STRING,
          description: STRING,
          preconditions: STRING,
          steps: STRINGS,
          expectedResult: STRING,
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
          testData: STRING,
          validationPoints: STRINGS,
          derivedFrom: {
            type: 'object',
            properties: {
              kind: { type: 'string', enum: ['rule', 'decision', 'finding', 'step'] },
              ref: STRING,
              lines: STRINGS,
              quote: STRING,
            },
            required: ['kind', 'lines'],
          },
        },
        required: ['id', 'name', 'category', 'description', 'priority'],
      },
    },
    testSuite: {
      type: 'object',
      properties: { code: STRING },
      required: ['code'],
    },
    manualTestingRequirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: STRING,
          reason: STRING,
          verificationSteps: STRINGS,
        },
        required: ['area', 'reason', 'verificationSteps'],
      },
    },
    coverageEstimate: {
      type: 'object',
      properties: {
        percentage: { type: 'number' },
        explanation: STRING,
        missingCoverage: STRING,
      },
      required: ['percentage', 'explanation', 'missingCoverage'],
    },
  },
  required: ['testCases', 'testSuite', 'manualTestingRequirements', 'coverageEstimate'],
} as const;

/** The schema for a stage's JSON answer, or `undefined` where the stage has none. */
export function responseSchemaForStage(stage: ModelStage | undefined): object | undefined {
  if (stage === 'transformation') return TRANSFORMATION_RESPONSE_SCHEMA;
  if (stage === 'testing') return TESTING_RESPONSE_SCHEMA;
  return undefined;
}
