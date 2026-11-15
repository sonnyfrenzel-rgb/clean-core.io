import { ThinkingLevel, type ThinkingConfig } from '@google/genai';
import { EVALUATION_GEMINI_MODEL } from './constants';

/**
 * How much the model thinks before it answers, per answer shape.
 *
 * Fill calls of the engine-led Transformation — the fills and the repair
 * rounds, which share the `transformation-fill` shape — think LOW. Measured
 * 13.10.2026 (A/B on the SD program, 39 real calls, gemini-3.8-flash): LOW took
 * p50 5.4 s / p90 9.7 s per call instead of 121–246 s, cost about $0.004
 * instead of about $0.045, and was at least as usable (4 of 6 units against 2
 * of 6 on the same units; the default declined more). MINIMAL is refused by
 * the model (400). Every other shape keeps the provider's default.
 *
 * The business layer of Documentation (`documentation-business`, roadmap
 * 3.0.13) keeps the provider's default too: nothing about it has been
 * measured, and the fill measurement says nothing about an answer that writes
 * business prose with a basis for every sentence. Its level is configurable —
 * `GEMINI_THINKING_DOCUMENTATION_BUSINESS` = `low`, `medium` or `high` on the
 * service — so the measurement `lib/business-layer-parts.ts` describes (latency,
 * thinking tokens and usable rows per part size, default against LOW) can be
 * run and its result set without a release. Unset or anything else: default.
 *
 * A level per model and stage, where a shape says nothing (study of 13.11.2026,
 * `docs/design/model-combination.md`): the model under evaluation
 * (`EVALUATION_GEMINI_MODEL`, Hydrogen) thinks MEDIUM for the business
 * statements. Measured blind on the seven largest learn cases of
 * the process benchmark (132 expected statements): MEDIUM 84.1 % equal against
 * 83.3 % with the provider's default, 24 against 35 technical sentences,
 * 10,900 against 16,600 thinking tokens, 52 s against 73 s median — and no
 * answer at or near the output bound, where the default's thinking had eaten
 * into it on a 1,000-line program. LOW lost 3.8 points, HIGH 4.5. The product
 * model keeps its default: on the same cases its default beat LOW 19:5 and
 * MEDIUM 17:10 per statement where it answered at all.
 *
 * Server-only (the route); pure apart from the SDK's enum.
 */
export const DOCUMENTATION_BUSINESS_THINKING_ENV = 'GEMINI_THINKING_DOCUMENTATION_BUSINESS';

const CONFIGURABLE: Record<string, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

/** The level a model thinks at for a stage, where no shape rule applies. */
const MODEL_STAGE_LEVELS: Readonly<Record<string, Readonly<Record<string, ThinkingLevel>>>> = {
  // Owner decision 13.11.2026 (evening): Hydrogen MEDIUM on every stage it is given — where the measurement
  // allows it. Measured per stage with `tests/prozess-benchmark/stage-bench.ts` (10 learn cases, blind, MEDIUM
  // against the provider's default): analyze 0 against 1 contradicting answers, 25 s against 49 s median;
  // design 5 against 6, 33 s against 46 s; documentation 0 against 1, 18 s against 30 s — each about 35 %
  // cheaper, the default fuller, MEDIUM more correct (wins 6:4, 6:4 and 5:2 for the default, p ≥ 0.45: no
  // difference at this size). Testing is the exception: the default's test classes were the usable ones (8:1,
  // p = 0.04; MEDIUM left stubs unimplemented and assertions empty), so Testing keeps the provider's default
  // and its 80 s. The statements' measurement is in the module header.
  [EVALUATION_GEMINI_MODEL]: {
    analyze: ThinkingLevel.MEDIUM,
    statements: ThinkingLevel.MEDIUM,
    design: ThinkingLevel.MEDIUM,
    documentation: ThinkingLevel.MEDIUM,
  },
};

export function thinkingConfigFor(
  shape: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
  /** The call's model and stage, for the levels above; absent, only the shape decides. */
  call?: { model: string; stage: string },
): ThinkingConfig | undefined {
  if (shape === 'transformation-fill') return { thinkingLevel: ThinkingLevel.LOW };
  // 3.0.20 (owner decision 2), measured 21.10.2026 on the 1,000-line example: rewording 201
  // sentences took 124 s with the default thinking (13,079 thinking tokens) — past the 120 s
  // the service allows a request — and 36 s at LOW, with no thinking tokens.
  if (shape === 'plain-wording') return { thinkingLevel: ThinkingLevel.LOW };
  // 13.11.2026 (owner decision): the rewording of the business statements for a business reader
  // (`lib/statement-rewording.ts`) — measured at LOW: 12 s median, no thinking tokens, 87.8 % equal.
  if (shape === 'statements-rewording') return { thinkingLevel: ThinkingLevel.LOW };
  if (shape === 'documentation-business') {
    const level = CONFIGURABLE[(env[DOCUMENTATION_BUSINESS_THINKING_ENV] ?? '').trim().toLowerCase()];
    if (level) return { thinkingLevel: level };
    // Unset: the model's level for the stage below, as for a call without a shape — the business layer
    // is the documentation stage's answer, and the stage's model was measured with it.
  }
  if (call && (shape === undefined || shape === 'documentation-business')) {
    const level = MODEL_STAGE_LEVELS[call.model]?.[call.stage];
    if (level) return { thinkingLevel: level };
  }
  return undefined;
}
