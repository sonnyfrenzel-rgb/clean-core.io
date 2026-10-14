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
 * Server-only (the route); pure apart from the SDK's enum.
 */
export function thinkingConfigFor(shape: string | undefined): ThinkingConfig | undefined {
  return shape === 'transformation-fill' ? { thinkingLevel: ThinkingLevel.LOW } : undefined;
}
