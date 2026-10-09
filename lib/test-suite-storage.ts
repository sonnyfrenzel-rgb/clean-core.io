import type { CoverageEstimate, TestSuite } from '@/lib/types';

/**
 * The test suite and coverage estimate as the Testing stage stores them on the
 * project document: exactly the keys of `TestSuite` and `CoverageEstimate`,
 * typed. firestore.rules accepts these two fields from the browser in this
 * shape only (isValidTestSuite, isValidCoverageEstimate), and the model's
 * answer may carry other keys or other types.
 */

/** The text limits firestore.rules sets on these fields. */
const LIMITS = { code: 999_999, config: 200_000, spec: 999_999, note: 20_000 } as const;

const text = (value: unknown, max: number): string | undefined =>
  typeof value === 'string'
    ? value.slice(0, max)
    : typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : undefined;

export function storedTestSuite(value: unknown): TestSuite {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const suite: TestSuite = { code: text(source.code, LIMITS.code) ?? '' };
  const config = text(source.config, LIMITS.config);
  const spec = text(source.spec, LIMITS.spec);
  if (config !== undefined) suite.config = config;
  if (spec !== undefined) suite.spec = spec;
  return suite;
}

export const NO_COVERAGE_ESTIMATE: CoverageEstimate = {
  percentage: 0,
  explanation: 'No coverage estimate available',
  missingCoverage: 'N/A',
};

export function storedCoverageEstimate(value: unknown): CoverageEstimate {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...NO_COVERAGE_ESTIMATE };
  const source = value as Record<string, unknown>;
  // "80%" and 80 both mean 80; anything that is no number in 0..100 is 0.
  const parsed = typeof source.percentage === 'number' ? source.percentage : parseFloat(String(source.percentage ?? ''));
  const percentage = Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
  return {
    percentage,
    explanation: text(source.explanation, LIMITS.note) ?? NO_COVERAGE_ESTIMATE.explanation,
    missingCoverage: text(source.missingCoverage, LIMITS.note) ?? NO_COVERAGE_ESTIMATE.missingCoverage,
  };
}
