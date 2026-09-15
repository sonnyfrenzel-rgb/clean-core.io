/**
 * UX review agent — the one place that decides what the reviewer is, what it
 * looks at, and how much it may spend. Runbook: docs/UX-REVIEW-AGENT.md.
 * Guard spec: tests/ux-review-guard.spec.ts.
 */

/** Pinned: Meta's Muse Spark 1.3 on OpenRouter, multimodal. Not the "Contributor" variant, which trades prompts for price. */
export const UX_MODEL = 'meta/muse-spark-1.3';

/** OpenRouter list price, 15.09.2026, USD per million tokens. */
export const PRICE_PER_MTOK = { input: 1.25, output: 4.25 };

export const CHARS_PER_TOKEN = 3.5;

/** What a screenshot is assumed to cost as input. Deliberately high: an underestimate would let a call past the cap. */
export const TOKENS_PER_IMAGE = 1_600;

/**
 * Spend per review, checked before every call against what has actually been
 * spent plus a worst-case estimate for the call (full output allowance). What
 * does not fit is named in the report as not reviewed. The hard ceiling is the
 * credit limit of the OpenRouter key.
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
