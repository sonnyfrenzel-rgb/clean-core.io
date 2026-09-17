/**
 * QA review loop — the one place that decides what the reviewer is, what it
 * sees, and how much it may spend. Everything else in scripts/qa reads from
 * here, so a model change or a budget change is a one-line diff with a guard
 * spec watching it (tests/qa-review-guard.spec.ts).
 *
 * Architecture and runbook: docs/QA-REVIEW-LOOP.md.
 */

/**
 * Pinned on purpose: an alias such as `~openai/gpt-luna-latest` would change the reviewer without a commit.
 *
 * Two reviewers, chosen by Sonny on 15.09.2026: every push to `dev` gets a delta review by the cost-efficient
 * tier; every release on `main` gets a review of the whole code base by the flagship of the same series.
 * GPT-6 Astra reviewed the deltas until then; GPT-6 Astra Pro was considered for `main` and dropped on cost.
 */
export const QA_MODEL = 'openai/gpt-5.6-luna';
export const QA_FULL_MODEL = 'openai/gpt-5.6-sol';

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

/** The dev service's run.app address — dev.clean-core.io has no A record (CLAUDE.md). */
export const DEV_URL = 'https://clean-core-dev-qcevuoi3uq-ew.a.run.app';

/**
 * Spend is capped per review, not hoped for. OpenRouter list prices per million tokens (15.09.2026); the cap
 * is checked against a conservative estimate before any call is made, and the actual cost from OpenRouter's
 * usage record is written into every report. A model without a price here cannot be costed.
 */
export const PRICES = {
  [QA_MODEL]: { input: 0.2, output: 1.2 },
  [QA_FULL_MODEL]: { input: 2, output: 10 },
};
export const PRICE_PER_MTOK = PRICES[QA_MODEL];

export const BUDGET = {
  /**
   * Estimated budget for one review — not a hard ceiling. Before every call:
   * what has actually been spent (OpenRouter's usage record) plus an estimate
   * for this call — request characters at 3.5 per token, the response schema
   * included, and the full output allowance. A call that could cross the budget
   * by that estimate is not made; its files are reported as not reviewed.
   *
   * Characters per token is an assumption: token-dense text can tokenise worse,
   * so a single call can overrun by the difference (QA review of 2f9b128bafd4).
   * The hard ceiling is the credit limit on the OpenRouter key itself.
   *
   * On Luna one full call estimates at about $0.05, so the cap no longer decides coverage — the call count
   * does. It was $2.50 and two calls on GPT-6 Astra, and a delta that did not fit came back incomplete and
   * cost another round.
   */
  maxCostUsd: 0.5,
  /** Delta context per model call, in characters. */
  maxBatchChars: 200_000,
  /** Calls per review. What does not fit is named in the report as not reviewed, never silently dropped. */
  maxBatches: 4,
  /**
   * Includes reasoning tokens. The first live run (15.09.2026) spent a 12,000
   * allowance entirely on reasoning at effort `high` and returned no review.
   */
  maxOutputTokens: 32_000,
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

/**
 * The review of a release on `main`: the whole code base, area by area, by QA_FULL_MODEL. About 4 MB of
 * reviewable code on 15.09.2026 — some 1.3 million input tokens with line numbers and the file map, so roughly
 * $3 of input and at most $6 of output across its calls; high reasoning effort needs the larger output
 * allowance. It never gates a release; its findings are fixed on `dev` like any other (docs/QA-REVIEW-LOOP.md §10).
 */
export const FULL_BUDGET = {
  maxCostUsd: 10,
  maxBatchChars: 400_000,
  maxBatches: 14,
  maxOutputTokens: 48_000,
  requestTimeoutMs: 20 * 60_000,
  effort: 'high',
};

export const CHARS_PER_TOKEN = 3.5;

export function estimateCostUsd(inputChars, calls, { price = PRICE_PER_MTOK, maxOutputTokens = BUDGET.maxOutputTokens } = {}) {
  const input = (inputChars / CHARS_PER_TOKEN / 1e6) * price.input;
  const output = ((calls * maxOutputTokens) / 1e6) * price.output;
  return input + output;
}

/** May a call with this much input still be made, given what has actually been spent? */
export function withinBudget(spentUsd, inputChars, { budget = BUDGET, price = PRICE_PER_MTOK } = {}) {
  return spentUsd + estimateCostUsd(inputChars, 1, { price, maxOutputTokens: budget.maxOutputTokens }) <= budget.maxCostUsd;
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
  // The reference corpus bundle: 209 ABAP fixtures and their expectations,
  // generated from `docs/korpus/referenzkorpus-v2.1.md` by
  // `scripts/korpus/build-bundle.mjs`. Nobody writes these by hand, so there is
  // nothing here a code review can find — but there is a great deal of it, and
  // that is the problem it caused. Adding the corpus on 17.09.2026 put 2.7 MB
  // of fixtures into the delta; the checkpoint could no longer advance, the
  // delta grew with every push, and the review of `5f84bb2` made **zero model
  // calls** while still reporting `go_with_notes` — a green tick over code
  // nobody read, which is worse than a red one. The trust-chain fix of the same
  // day went unreviewed for exactly this reason.
  //
  // What still guards the bundle, so that excluding it costs nothing: the
  // converter is deterministic and its idempotence is asserted, every source
  // file is checked against the hash the case book declares for it, and
  // `tests/korpus-engine.spec.ts` turns red the moment bundle and book drift
  // apart. The book itself stays reviewable — it is under `docs/`, which this
  // list already covers as prose, and it is the source these files are built
  // from.
  /^tests\/korpus\/cases\//,
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

/**
 * The review agents' own machinery. A `medium` finding here is reported and fixed in its own step, but it does
 * not hold a product release on `dev` (Sonny, 15.09.2026): most QA rounds before that date were spent on
 * medium findings in the agents themselves, not in the product. `critical` and `high` still block everywhere.
 */
export const AGENT_INFRASTRUCTURE = [
  /^scripts\/(qa|security|ux)\//,
  /^\.github\/workflows\/(qa-review|qa-weekly-health|security-audit|ux-review)\.yml$/,
  /^\.claude\/(hooks|skills)\//,
  /^docs\/(qa|security|ux)\//,
  /^tests\/(qa-review|security-audit|ux-review)-guard\.spec\.ts$/,
  /^tests\/capture-screens\.spec\.ts$/,
];

/**
 * Values that match a credential pattern and are public by design. They are still redacted before anything is
 * sent; they are not reported as committed credentials. Only the full review needs this: it reads these files on
 * every release, and a finding refuted once is raised again by the next review (report.mjs isSuppressed).
 */
export const PUBLIC_BY_DESIGN = [
  {
    path: 'firebase-config.json',
    kind: 'Google API key',
    why: 'the Firebase web API key identifies the project to the client SDK and ships in every page; access is enforced by Firebase Auth and the Firestore rules, not by keeping it secret',
  },
];

export const isPublicByDesign = (hit) => PUBLIC_BY_DESIGN.some((p) => p.path === hit.path && p.kind === hit.kind);

export const isAgentInfrastructure = (path) => AGENT_INFRASTRUCTURE.some((re) => re.test(String(path || '')));
