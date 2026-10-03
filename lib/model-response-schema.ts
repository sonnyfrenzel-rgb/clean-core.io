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
 * Only the Transformation stage has one today. It is the stage whose answer is
 * source code, which is where foreign escapes come from, and its shape is the
 * one the page validates (`isUsableFile`, `missingArtefacts`,
 * `usableTestSuite`). The schema asks for that shape and nothing more; the
 * page's validation still runs on every answer, schema or not.
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

/** The schema for a stage's JSON answer, or `undefined` where the stage has none. */
export function responseSchemaForStage(stage: ModelStage | undefined): object | undefined {
  return stage === 'transformation' ? TRANSFORMATION_RESPONSE_SCHEMA : undefined;
}
