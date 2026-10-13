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
          // 3.0.10 (external review F-01/F-05): the business rule of the ORIGINAL
          // the case checks, and the result the original gives — read by
          // `lib/testing-rule-trace.ts`, which drops a malformed one with its reason.
          ruleTrace: {
            type: 'object',
            properties: {
              ruleId: STRING,
              kind: { type: 'string', enum: ['rule', 'exception', 'edge'] },
              lines: STRINGS,
              quote: STRING,
              originalBehaviour: STRING,
              expectedFromOriginal: STRING,
            },
            required: ['ruleId', 'lines', 'expectedFromOriginal'],
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

/**
 * 3.0.12 engine-led transformation (`docs/design/engine-led-transformation.md`
 * §8.2): one fill call answers with the bodies of the functions it was asked
 * for — `{ units: [{ unitId, body, needs, refused }] }`. `refused` is null or
 * `{ reason }` (the model may decline a unit rather than guess);
 * `lib/transformation/fill-prompt.ts` (`parseFillAnswer`) validates every
 * answer before a body is spliced.
 */
export const TRANSFORMATION_FILL_SCHEMA = {
  type: 'object',
  properties: {
    units: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          unitId: STRING,
          body: STRING,
          // The predicate bodies of the unit's guards (design §9.1), by guard id.
          guards: {
            type: 'array',
            items: { type: 'object', properties: { id: STRING, body: STRING }, required: ['id', 'body'] },
          },
          needs: STRINGS,
          // Optional: absent (or without a reason) reads as "not refused".
          refused: {
            type: 'object',
            properties: { reason: STRING },
          },
        },
        required: ['unitId', 'body'],
      },
    },
  },
  required: ['units'],
} as const;

/**
 * An answer shape within a stage. The fill calls belong to the
 * `transformation` stage — its switch and its receipt — but answer in a shape
 * of their own; the request names it beside the stage.
 */
export const RESPONSE_SHAPES = ['transformation-fill'] as const;
export type ResponseShape = (typeof RESPONSE_SHAPES)[number];

export function isResponseShape(value: unknown): value is ResponseShape {
  return typeof value === 'string' && (RESPONSE_SHAPES as readonly string[]).includes(value);
}

/** The stage each shape belongs to: a shape is only valid under its own stage. */
export const RESPONSE_SHAPE_STAGE: Record<ResponseShape, ModelStage> = {
  'transformation-fill': 'transformation',
};

/** The schema for a stage's JSON answer, or `undefined` where the stage has none. */
export function responseSchemaForStage(stage: ModelStage | undefined, shape?: ResponseShape): object | undefined {
  if (shape === 'transformation-fill' && stage === 'transformation') return TRANSFORMATION_FILL_SCHEMA;
  if (stage === 'transformation') return TRANSFORMATION_RESPONSE_SCHEMA;
  if (stage === 'testing') return TESTING_RESPONSE_SCHEMA;
  return undefined;
}
