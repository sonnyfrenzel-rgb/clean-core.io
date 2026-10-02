/**
 * QA review loop — the one place that decides what the reviewer is, what it
 * sees, and how much it may spend. Everything else in scripts/qa reads from
 * here, so a model change or a budget change is a one-line diff with a guard
 * spec watching it (tests/qa-review-guard.spec.ts).
 *
 * Architecture and runbook: docs/QA-REVIEW-LOOP.md.
 */

/**
 * Which model reviews is no longer decided here (owner decision, 01.10.2026). Every agent that runs over
 * OpenRouter sends `openrouter/auto`, and OpenRouter's Auto Router picks the model per call. What this file
 * still decides is the band it picks from and what a call may cost:
 *
 * - `costTier` is the quality floor: the Auto Router's cost band (`low` … `max`). The delta review of every push
 *   to `dev` runs at `high`, the full review of a release on `main` at `xhigh`.
 * - `maxPrice` (USD per million tokens) is sent as `provider.max_price`, so OpenRouter serves no endpoint above
 *   it, and every pre-call estimate is made at exactly that price. OpenRouter does not publish where a tier
 *   ends; without a ceiling the "worst case" of a cap would be a guess. Probed 01.10.2026: `high` chose
 *   z-ai/glm-5.3 ($0.22/$4.40) and glm-5.2 ($1.40/$4.40), `xhigh` anthropic/claude-sonnet-5.5 ($2/$10).
 *
 * What this costs, written down: a report can no longer be compared with the one before it as the same
 * reviewer's judgement, because the reviewer may differ per call. Every report therefore names the model(s)
 * that answered (meta.models), and a change in findings has to be read with that in mind.
 *
 * Until 01.10.2026 the delta reviewer was pinned to openai/gpt-6-luna and the full reviewer to
 * openai/gpt-6-luna-pro, both at $0.10/$0.50.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const AUTO_MODEL = 'openrouter/auto';

export const ROUTER = {
  delta: { costTier: 'high', maxPrice: { input: 1.5, output: 4.5 } },
  full: { costTier: 'xhigh', maxPrice: { input: 3, output: 15 } },
};

export const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
/** The public model list — read to confirm what the router chose can read the inputs a call sent (openrouter.mjs confirmInputs). */
export const OPENROUTER_MODELS_ENDPOINT = 'https://openrouter.ai/api/v1/models';

/** The dev service's run.app address — dev.clean-core.io has no A record (CLAUDE.md). */
export const DEV_URL = 'https://clean-core-dev-qcevuoi3uq-ew.a.run.app';

/** The production service `clean-core`, checked after every deploy from main (deploy.yml, job smoke-production). */
export const PROD_URL = 'https://clean-core.io';

/**
 * Spend is capped per review, not hoped for. The cap is checked before any call against what OpenRouter
 * actually reported as spent (`usage.cost`) plus an estimate for the call at the price ceiling of its tier —
 * the most any endpoint may charge for it — and the actual cost is written into every report.
 */
export const PRICE_PER_MTOK = ROUTER.delta.maxPrice;

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
   *
   * On GPT-6 Luna (22.09.2026) that estimate halves again, to about $0.022 — $0.016 of output allowance plus
   * $0.006 of input at a full 200k batch. The cap of $0.50 therefore stops binding altogether: ten calls
   * estimate at roughly $0.22, and `maxBatches` is now the only thing that ends a review. The cap stays where
   * it is as a floor against a pricing change nobody noticed, not as a coverage decision.
   *
   * Raised from $0.50 to $3.80 on 01.10.2026 (owner decision), with the move to the Auto Router at `high`. At
   * the ceiling of $1.5/$4.5 one full batch estimates at about $0.30, nearly all of it the 48,000-token output
   * allowance; at $0.50 a push would have been reviewed in one or two batches, and an incomplete review keeps
   * the checkpoint where it was (see maxBatches). All ten batches at their worst case come to about $3.02, under
   * 80 % of $3.80 (tests/qa-review-guard.spec.ts), so the budget can never be the reason a checkpoint sticks.
   * The cap is an upper bound; what is counted against it is the cost OpenRouter reports (`usage.cost`) — about
   * $0.09 a full batch at the prices the router chose in the probes.
   */
  /**
   * $6.50 since 01.10.2026 (owner decision), raised with maxOutputTokens to 96,000: ten worst-case batches
   * then come to about $5.18, still under 80 % of the cap.
   */
  maxCostUsd: 6.5,
  /** Delta context per model call, in characters. */
  maxBatchChars: 200_000,
  /**
   * Calls per review. What does not fit is named in the report as not reviewed, never silently dropped.
   *
   * Raised from 4 to 10 on 18.09.2026 (Sonny's go) because four calls had turned into a deadlock rather
   * than a budget. An incomplete review leaves the checkpoint at its base (report.mjs), so the delta it
   * could not read comes back *plus* everything pushed since — and grows again with every push. The review
   * of `13d1ffa` left 20 files unread "outside the 4-call budget" and the checkpoint stuck at `a19945e`
   * for a second day.
   *
   * Money was never the binding constraint here: that review cost $0.1031 against a $0.50 cap. On the 5.6
   * tier ten full calls estimated at 10 × ($0.0384 output + $0.0114 input) = $0.498, so `withinBudget`
   * still refused the eleventh and the cap did real work. **Since the move to GPT-6 Luna on 22.09.2026 it
   * does not:** the same ten calls estimate at about $0.22, and `maxBatches` alone ends a review. Raising
   * this number now costs review coverage nothing and money almost nothing — which is a reason to leave it
   * at ten deliberately rather than by inertia: a review that reads more than ten batches is reading a
   * backlog, and the answer to a backlog is a push, not a bigger budget.
   */
  maxBatches: 10,
  /**
   * Includes reasoning tokens. The first live run (15.09.2026) spent a 12,000
   * allowance entirely on reasoning at effort `high` and returned no review.
   *
   * Raised from 32,000 to 48,000 on 23.09.2026, and the reason is worth keeping
   * apart from the earlier one. This time the model was not lost in thought: the
   * delta review of 4152818 stopped at `completion_tokens=32000` with only 3,855
   * of them reasoning, so the whole allowance went into a review that still had
   * more to say, and the JSON ended mid-structure.
   *
   * `packBatches` splits by *input* size, which is the wrong axis for this
   * failure — nine commits of dense new code make one batch whose input fits and
   * whose output does not. 48,000 is not a guess: `FULL_BUDGET` has run at that
   * figure since 15.09.2026, including over the whole code base.
   *
   * What this does not fix: a batch large enough to exceed 48,000 fails the same
   * way, because a cut-off batch fails the review rather than splitting and
   * retrying. That is the real repair and it is a bigger change than a release
   * should carry.
   *
   * Raised to 96,000 on 01.10.2026 (owner decision): the delta review of c25437ab3e13 stopped at
   * completion_tokens=48000 (17,608 of them reasoning) on a large merge push.
   */
  maxOutputTokens: 96_000,
  /** Lines of unchanged code around each hunk — enough to see the enclosing branch, not the whole file. */
  hunkContextLines: 12,
  /** Symbols whose callers are looked up outside the delta (impact analysis). */
  maxSymbols: 15,
  maxCallersPerSymbol: 3,
  /** A single file's diff above this is read in consecutive parts of at most this size (pack.mjs partsOf); the file counts as read only when all of them were. */
  maxFileDiffChars: 60_000,
  requestTimeoutMs: 15 * 60_000,
  retries: 2,
};

/**
 * The full review of a release on `main`: the whole code base, area by area, by the Auto Router at ROUTER.full. It never gates
 * a release; its findings are fixed on `dev` like any other (docs/QA-REVIEW-LOOP.md §10).
 *
 * `maxCostUsd` is the ceiling; `maxBatches` exists so a runaway plan cannot sit in a queue for hours. Until
 * 23.09.2026 the second one was doing the first one's job, and badly. Sol's run on v2.14.0 (3131afa) spent
 * $5.5388 in 14 calls at effort high and stopped on the *call count*, with **470 files and 5.4 MB listed as
 * NOT REVIEWED** — every component of the new process map, the process revisions, the process states and the
 * workspace shell. About half the code base, and the newest half. The money was not the constraint: $4.46 of
 * the approved $10 was left, and raising the count to cover everything would have needed about 28 calls and
 * roughly $11, just past the ceiling. Reading 10.8 MB once is 3.09M input tokens, which at Sol's $2 per
 * million is $6.17 before a single thought.
 *
 * Luna Pro reads the same 3.09M tokens for $0.31. Whole-repository coverage — 28 calls of 400,000 characters,
 * about 17,000 output tokens each as measured — comes to roughly $0.55. So `maxBatches` is now set to cover
 * the repository rather than to ration it, and it is the *work* that decides the number: 10.8 MB at 400,000
 * characters a call is 27, and 28 leaves one call of headroom for a repository that grows between releases.
 * What still does not fit is named in the report, never silently dropped — that NOT REVIEWED list is the only
 * reason any of this was noticed.
 *
 * `maxCostUsd` stays at $10 although the estimate is now twenty times below it. It is a floor against a
 * pricing change nobody noticed, not a coverage decision: `withinBudget` refuses the first call that would
 * cross it, whatever this file says about batches.
 */
export const FULL_BUDGET = {
  /**
   * Unchanged at $10 with the move to the Auto Router at `xhigh` (01.10.2026), and binding again: at the ceiling
   * of $3/$15 a full batch estimates at about $1.06, and at the prices `xhigh` chose in the probes (Sonnet-class,
   * $2/$10) it costs about $0.40, so roughly 22 of the 28 batches fit. What does not is named as NOT REVIEWED.
   */
  maxCostUsd: 10,
  maxBatchChars: 400_000,
  maxBatches: 28,
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
  // Its manifest belongs to the same bundle (18.09.2026): `tests/korpus/manifest.json`
  // is written by the same converter (`build-bundle.mjs`, `files.set('manifest.json', …)`),
  // a 72,399-character diff when it arrived in `b64818a`. The same guards cover it:
  // `--check` compares it byte for byte with a fresh build (`korpus-engine.spec.ts`,
  // "a fresh run of the converter produces no change"), and "the case book
  // hash in the manifest is the hash of the file in docs/korpus/" ties it to
  // the book. Not `tests/korpus/baseline.json`: that file is judged by hand — a
  // verdict and a reason per case — and is read like any other code, in parts
  // when it is large.
  /^tests\/korpus\/manifest\.json$/,
  // The process benchmark (27.09.2026): 200 constructed ABAP cases with their
  // expected answers and review logs, about 40,000 lines of fixtures. The same
  // failure as the corpus above, reproduced: the review of `be3f06343260` spent
  // its whole budget on `tests/prozess-benchmark/cases/` and never reached the
  // engine change beside it, so the checkpoint stayed put. What guards the data
  // instead: `frozen-*.json` holds the SHA-256 of every case file, taken before
  // the engine first saw them, and `validate.py` checks every hash on each run.
  // The tools in that folder (`evaluate.ts`, `validate.py`, `report.py`) stay
  // reviewable; only the fixtures and the hash lists are data.
  /^tests\/prozess-benchmark\/cases\//,
  /^tests\/prozess-benchmark\/frozen-\d{3}-\d{3}\.json$/,
  // The judges' verdicts on the business statements, one file per case and run
  // (`judge/<lauf>/in|out/`): model output about data, not code.
  /^tests\/prozess-benchmark\/judge\/[^/]+\/(in|out)\//,
  /^public\//,
  /^docs\//,
  /^scratch\//,
  /^tmp\//,
  /^dist\//,
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

/**
 * Routes the smoke check expects to answer 200 on a freshly deployed revision, dev and production alike.
 * `/?auth=signin` is the sign-in page: the dialog renders in the browser, so the server answers the landing shell
 * and the static-asset check (scripts/qa/lib/smoke.mjs) is what proves its scripts are there.
 */
export const SMOKE_ROUTES = ['/', '/?auth=signin', '/api/health', '/method/levels', '/verify-pack', '/trust', '/robots.txt', '/sitemap.xml', '/llms.txt'];

/** The public half of the audit-pack signing key (app/.well-known/clean-core-io-signing.json/route.ts). */
export const SIGNING_KEY_PATH = '/.well-known/clean-core-io-signing.json';

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
    // Which field of that file holds the value, so the value itself can be matched — see publicByDesignValues.
    field: 'apiKey',
    why: 'the Firebase web API key identifies the project to the client SDK and ships in every page; access is enforced by Firebase Auth and the Firestore rules, not by keeping it secret',
  },
];

export const isPublicByDesign = (hit) => PUBLIC_BY_DESIGN.some((p) => p.path === hit.path && p.kind === hit.kind);

/**
 * The values behind the entries above, read out of their files.
 *
 * `isPublicByDesign` keys on the *path* a hit names, which works for the
 * per-file redaction and nowhere else. The last net before a message leaves the
 * runner reports its hits under the path `outgoing message`, so the Firebase web
 * key never matched there and came back as a critical "committed credential" on
 * every single push — carried finding 19146e4fbb01, raised again by the delta
 * review of 98f374de6604 although docs/QA-REVIEW-LOOP.md already promised it was
 * suppressed. Matching the value suppresses it in that net too, and only there:
 * any other value matching the same pattern is still reported.
 */
export function publicByDesignValues(root = process.cwd()) {
  const values = new Set();
  for (const entry of PUBLIC_BY_DESIGN) {
    if (!entry.field) continue;
    try {
      const value = JSON.parse(readFileSync(join(root, entry.path), 'utf8'))[entry.field];
      if (typeof value === 'string' && value) values.add(value);
    } catch {
      // The file may not exist at the reviewed commit — then there is nothing to suppress.
    }
  }
  return values;
}

export const isAgentInfrastructure = (path) => AGENT_INFRASTRUCTURE.some((re) => re.test(String(path || '')));
