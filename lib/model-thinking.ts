import { ThinkingLevel, type ThinkingConfig } from '@google/genai';

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
 * Server-only (the route); pure apart from the SDK's enum.
 */
export const DOCUMENTATION_BUSINESS_THINKING_ENV = 'GEMINI_THINKING_DOCUMENTATION_BUSINESS';

const CONFIGURABLE: Record<string, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export function thinkingConfigFor(
  shape: string | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): ThinkingConfig | undefined {
  if (shape === 'transformation-fill') return { thinkingLevel: ThinkingLevel.LOW };
  // 3.0.20 (owner decision 2), measured 21.10.2026 on the 1,000-line example: rewording 201
  // sentences took 124 s with the default thinking (13,079 thinking tokens) — past the 120 s
  // the service allows a request — and 36 s at LOW, with no thinking tokens.
  if (shape === 'plain-wording') return { thinkingLevel: ThinkingLevel.LOW };
  if (shape === 'documentation-business') {
    const level = CONFIGURABLE[(env[DOCUMENTATION_BUSINESS_THINKING_ENV] ?? '').trim().toLowerCase()];
    return level ? { thinkingLevel: level } : undefined;
  }
  return undefined;
}
