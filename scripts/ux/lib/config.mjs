/**
 * UX review agent — the one place that decides what the reviewer is, what it
 * looks at, and how much it may spend. Runbook: docs/UX-REVIEW-AGENT.md.
 * Guard spec: tests/ux-review-guard.spec.ts.
 */

/** Pinned: Meta's Muse Spark 1.3 on OpenRouter, multimodal. Not the "Contributor" variant, which trades prompts for price. */
export const UX_MODEL = 'meta/muse-spark-1.3';

/** OpenRouter list price, 15.09.2026, USD per million tokens. */
export const PRICE_PER_MTOK = { input: 1.25, output: 4.25 };

/**
 * Characters per input token, deliberately low. Source with line-number prefixes
 * tokenises denser than prose; at 3.5 a token-dense batch could pass the check
 * and still cross the budget (QA review of 586e0ac1c218, finding 504b555454c1).
 */
export const CHARS_PER_TOKEN = 2.5;

/** What a screenshot is assumed to cost as input. Deliberately high: an underestimate would let a call past the budget. */
export const TOKENS_PER_IMAGE = 1_600;

/**
 * Estimated budget per review — not a hard ceiling. Before every call: what has
 * actually been spent (OpenRouter's usage record) plus a conservative estimate for
 * the call, the full output allowance included. A call that could cross the
 * budget by that estimate is not made, and its files are named as not reviewed.
 * Estimates can still be wrong; the hard ceiling is the credit limit on the
 * OpenRouter key itself.
 */
export const BUDGETS = {
  /** The whole product, area by area, then one end-to-end synthesis. */
  full: { maxCostUsd: 6, maxBatchChars: 360_000, maxBatches: 12, maxImagesPerCall: 16, maxOutputTokens: 40_000, effort: 'medium', synthesisEffort: 'high' },
  /** One release on main. */
  delta: { maxCostUsd: 1.5, maxBatchChars: 240_000, maxBatches: 3, maxImagesPerCall: 12, maxOutputTokens: 24_000, effort: 'medium', synthesisEffort: 'medium' },
  /** The agent itself changed on dev: the whole chain once, small. Never a checkpoint. */
  'self-test': { maxCostUsd: 0.3, maxBatchChars: 40_000, maxBatches: 1, maxImagesPerCall: 2, maxOutputTokens: 8_000, effort: 'low', synthesisEffort: 'low' },
};

export const REQUEST_TIMEOUT_MS = 15 * 60_000;

/** A single changed file up to this size goes in whole; above it, as a diff with context. */
export const WHOLE_FILE_CHARS = 40_000;
export const DIFF_CONTEXT_LINES = 30;

/** Bytes of screenshots per call, before base64. */
export const MAX_IMAGE_BYTES_PER_CALL = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export function estimateCostUsd({ chars, images = 0, maxOutputTokens }) {
  const input = ((chars / CHARS_PER_TOKEN + images * TOKENS_PER_IMAGE) / 1e6) * PRICE_PER_MTOK.input;
  const output = (maxOutputTokens / 1e6) * PRICE_PER_MTOK.output;
  return input + output;
}

export function withinBudget(budget, spentUsd, call) {
  return spentUsd + estimateCostUsd({ ...call, maxOutputTokens: budget.maxOutputTokens }) <= budget.maxCostUsd;
}

/** What users see: pages, components, styles, the stage model and the mails. Not API routes, not server helpers. */
export function isUxRelevant(path) {
  if (/^app\/api\//.test(path)) return false;
  return /^(app|components)\/.*\.(tsx|css)$/.test(path) || /^lib\/(workflow-steps|email-layout|email-events)\.ts$/.test(path);
}

/**
 * The product as journeys. Pages are matched by path; components land in the
 * area whose pages import them, or in `system` when several areas share them.
 * `screens` are the capture names (tests/capture-screens.spec.ts) that show the area.
 */
export const AREAS = [
  {
    id: 'zugang',
    title: 'Erster Eindruck und Zugang',
    pages: [/^app\/page\.tsx$/, /^app\/layout\.tsx$/, /^app\/features\//, /^app\/(impressum|datenschutz|terms|licenses|unsubscribe|survey)\//],
    screens: ['00-access', '01-landing'],
  },
  {
    id: 'wissen',
    title: 'Wissen, Katalog und Vertrauen',
    pages: [/^app\/(catalog|whitepaper|method|reference-analysis|clean-core-explained-print)\//, /^app\/\(app\)\/(knowledge|how-to|how-it-works|about|clean-core-explained|clean-core-score|sap-cloudification|sap-clean-core-object-classification|abap-custom-code-analysis|trust|verify-pack|tenant-security)\//],
    screens: ['10-knowledge', '12-catalog', '13-whitepaper', '14-how-to', '15-trust'],
  },
  {
    id: 'rahmen',
    title: 'App-Rahmen, Dashboard und Einstellungen',
    pages: [/^app\/\(app\)\/layout\.tsx$/, /^app\/\(app\)\/project\/\[projectId\]\/layout\.tsx$/, /^app\/\(app\)\/(dashboard|first-run|settings|admin)\//],
    screens: ['02-dashboard', '11-settings'],
  },
  {
    id: 'analyse',
    title: 'Analyse',
    pages: [/^app\/\(app\)\/project\/\[projectId\]\/analyze\//, /^components\/analyze\//],
    screens: ['03-analyze'],
  },
  {
    id: 'entwurf',
    title: 'Design und Transformation',
    pages: [/^app\/\(app\)\/project\/\[projectId\]\/(design|transformation)\//, /^components\/design\//],
    screens: ['04-design', '05-transformation'],
  },
  {
    id: 'nachweis',
    title: 'Dokumentation, Tests, Wirtschaftlichkeit und Übergabe',
    pages: [/^app\/\(app\)\/project\/\[projectId\]\/(documentation|testing|tco|delivery)\//],
    screens: ['06-testing', '07-documentation', '09-tco', '08-delivery'],
  },
  {
    id: 'system',
    title: 'Designsystem: gemeinsame Komponenten, Styles und Mails',
    pages: [/\.css$/, /^lib\/(workflow-steps|email-layout|email-events)\.ts$/],
    screens: [],
  },
];

/** Screens that stand for the product as a whole — the reference set for consistency when a change is local. */
export const REFERENCE_SCREENS = ['01-landing', '02-dashboard', '03-analyze', '08-delivery'];

/**
 * The six views of the 3.0 mockups, as the capture names them (`m3-mockup-desktop.jpg`
 * parses to screen `m3-mockup`). The target picture: wanted, but its absence does
 * not make a review of the product incomplete.
 */
export const MOCKUP_SCREENS = ['m1-mockup', 'm2-mockup', 'm3-mockup', 'm4-mockup', 'm5-mockup', 'm6-mockup'];

/**
 * Which mode an automatic run becomes. Until a complete full review exists, every
 * automatic run is that full review — a release delta or a self-test must not
 * stand in for a baseline that never happened (finding e4b1d7916a95).
 *
 * @param trigger 'release' (push to main) or 'agent' (the agent changed on dev)
 */
export function resolveMode(requested, trigger, reports) {
  if (requested !== 'auto') return requested;
  if (!baselineOf(reports)) return 'full';
  return trigger === 'agent' ? 'self-test' : 'delta';
}

/**
 * The complete full review a history builds on — the report itself, or the
 * reference every later report carries forward. The workflow fetches only the
 * newest reports, and the original full review must not fall out of that window
 * and trigger another one (finding 27096ea7fdbc).
 *
 * @param reports newest first, self-tests included
 */
export function baselineOf(reports) {
  for (const r of reports) {
    if (r.mode === 'full' && !r.incomplete) return { head: r.range?.head || null, createdAt: r.createdAt || null };
    if (r.baseline?.head) return r.baseline;
  }
  return null;
}

/** Capture file names: `03-analyze-desktop-s1.jpg`, `m2-mockup-desktop.jpg`. Anything else in the artifact is ignored. */
export const SHOT_NAME = /^((?:\d{2}|m\d)-[a-z0-9-]+?)-(desktop|phone|dark)(?:-s(\d))?\.jpg$/;

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

export const CATEGORIES = [
  'usability',
  'consistency',
  'visual-design',
  'typography',
  'color',
  'layout-responsive',
  'accessibility',
  'content-microcopy',
  'information-architecture',
  'interaction-feedback',
  'onboarding',
  'trust-transparency',
  'design-decision',
];

export const DIMENSIONS = ['color', 'typography', 'shape', 'spacing', 'iconography', 'components', 'copy-language', 'dark-mode', 'motion'];
