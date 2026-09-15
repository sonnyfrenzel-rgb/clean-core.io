/**
 * QA review loop — the one place that decides what the reviewer is, what it
 * sees, and how much it may spend. Everything else in scripts/qa reads from
 * here, so a model change or a budget change is a one-line diff with a guard
 * spec watching it (tests/qa-review-guard.spec.ts).
 *
 * Architecture and runbook: docs/QA-REVIEW-LOOP.md.
 */

/** Pinned on purpose: an alias such as `~openai/gpt-astra-latest` would change the reviewer without a commit. */
export const QA_MODEL = 'openai/gpt-6-astra';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** The dev service's run.app address — dev.clean-core.io has no A record (CLAUDE.md). */
export const DEV_URL = 'https://clean-core-dev-qcevuoi3uq-ew.a.run.app';

/**
 * Spend is capped per review, not hoped for. GPT-6 Astra lists at $10 per
 * million input tokens and $50 per million output tokens (OpenRouter,
 * 15.09.2026); the cap below is checked against a conservative estimate before
 * any call is made, and the actual cost from OpenRouter's usage record is
 * written into every report.
 */
export const PRICE_PER_MTOK = { input: 10, output: 50 };

export const BUDGET = {
  /** Hard ceiling for one review, estimated before the first call: input at 3.5 chars/token plus every call's full output allowance. */
  maxCostUsd: 2.5,
  /** Delta context per model call, in characters. */
  maxBatchChars: 200_000,
  /** Calls per review. What does not fit is named in the report as not reviewed, never silently dropped. */
  maxBatches: 2,
  maxOutputTokens: 12_000,
  /** Lines of unchanged code around each hunk — enough to see the enclosing branch, not the whole file. */
  hunkContextLines: 12,
  /** Symbols whose callers are looked up outside the delta (impact analysis). */
  maxSymbols: 15,
  maxCallersPerSymbol: 3,
  /** A single file's diff above this is cut and the cut is reported. */
  maxFileDiffChars: 60_000,
  requestTimeoutMs: 15 * 60_000,
  retries: 2,
};

export const CHARS_PER_TOKEN = 3.5;

export function estimateCostUsd(inputChars, calls) {
  const input = (inputChars / CHARS_PER_TOKEN / 1e6) * PRICE_PER_MTOK.input;
  const output = ((calls * BUDGET.maxOutputTokens) / 1e6) * PRICE_PER_MTOK.output;
  return input + output;
}

/**
 * Reasoning effort follows risk, not habit: a delta that touches rules, API
 * routes, the trust chain or CI gets the expensive pass; a copy change does not.
 */
export const EFFORT = { normal: 'medium', elevated: 'high' };

/** Paths that are never sent to the model — generated, binary, vendored or prose. */
export const IGNORED_PATHS = [
  /^package-lock\.json$/,
  /(^|\/)node_modules\//,
  /^lib\/abap\/generated\//,
  /^public\//,
  /^docs\//,
  /^scratch\//,
  /^tmp\//,
  /^dist\//,
  /^clean-core-video\//,
  /^abap-test-files\//,
  /\.(png|jpe?g|gif|svg|ico|webp|pdf|mp4|woff2?|ttf|zip)$/i,
  /-debug\.log$/,
  // Credential-shaped files are never read, let alone sent. They should not be in
  // the repository at all; if one is, gitleaks and the redaction pass report it.
  /(^|\/)\.env(\.|$)/,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
  /(service-account|firebase-adminsdk|credentials)[^/]*\.json$/i,
];

/** What a reviewer reads as code. Markdown is prose and goes through the claims channel instead. */
export const REVIEWABLE = /(\.(ts|tsx|js|mjs|cjs|json|ya?ml|css)$)|(^firestore\.rules$)|(^Dockerfile$)/;

/** Prose whose added lines are claims the code has to back (CHANGELOG entries quote acceptance criteria). */
export const CLAIM_SOURCES = [/^CHANGELOG\.md$/, /^README\.md$/, /^SECURITY\.md$/];

/**
 * Deterministic risk tags. `elevated` tags raise the reasoning effort and are
 * named in the prompt so the reviewer knows where a mistake costs most.
 */
export const RISK_RULES = [
  {
    tag: 'security',
    elevated: true,
    test: (p) =>
      /^(middleware\.ts|firestore\.rules)$/.test(p) ||
      /^app\/api\//.test(p) ||
      /^lib\/(firebase-admin|mfa|approval-token|audit-signing|s4-credentials|run-guard|runner-egress|sanitize-html|consent|rate-limit|safe-fetch)/.test(p),
  },
  {
    tag: 'trust-chain',
    elevated: true,
    test: (p) => /(audit-pack|run-signature|artefact-digest|workflow-steps|runs\/create|verify-pack|signing)/.test(p),
  },
  {
    tag: 'ci',
    elevated: true,
    test: (p) => /^\.github\/workflows\//.test(p) || /^(package\.json|next\.config\.mjs|playwright\.config\.ts|tsconfig\.json)$/.test(p),
  },
  { tag: 'engine', elevated: false, test: (p) => /^lib\/abap\//.test(p) },
  { tag: 'tests', elevated: false, test: (p) => /^tests\//.test(p) },
  { tag: 'ui', elevated: false, test: (p) => /^(app|components)\/.*\.tsx$/.test(p) },
];

/** Routes the smoke check expects to answer 200 on the freshly deployed dev revision. */
export const SMOKE_ROUTES = ['/', '/api/health', '/method/levels', '/verify-pack', '/trust', '/robots.txt', '/sitemap.xml', '/llms.txt'];

/** Response headers the root page must carry (set in middleware.ts / next.config.mjs). */
export const SMOKE_HEADERS = ['content-security-policy', 'strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy'];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/** Findings at or above this severity keep the loop open. `low` is reported, fixed when cheap, and never blocks. */
export const BLOCKING_SEVERITIES = new Set(['critical', 'high', 'medium']);
