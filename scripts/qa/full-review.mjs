#!/usr/bin/env node
/**
 * QA full review of a release on `main` — the whole code base, not a delta (.github/workflows/qa-review.yml, job
 * "Full review").
 *
 *   node scripts/qa/full-review.mjs          CI: one sealed report, a public line that says only that it ran
 *   node scripts/qa/full-review.mjs --dry    maintainer: files, batches and estimated cost of HEAD — no model call
 *
 * Guardrails as the delta review (docs/QA-REVIEW-LOOP.md §2 and §10): reads the repository, calls one pinned model
 * without tools, writes one sealed file. It never writes to the repository, to GitHub or to any other system,
 * and it never gates a release — its findings are fixed on `dev`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { estimateCostUsd, FULL_BUDGET, isPublicByDesign, PRICES, QA_FULL_MODEL, withinBudget } from './lib/config.mjs';
import { seal } from './lib/crypto.mjs';
import { buildFullUserMessage, filesAt, fullBrief, numbered, projectMap, reviewBatches } from './lib/full.mjs';
import { commitIdOrNull, git } from './lib/git-delta.mjs';
import { callReviewer } from './lib/openrouter.mjs';
import { packBatches } from './lib/pack.mjs';
import { carriedChars, carriedFor, loadBrief, REVIEW_SCHEMA } from './lib/prompt.mjs';
import { redactSecrets } from './lib/redact.mjs';
import { actualCost, buildReport, isSuppressed, publicSummary } from './lib/report.mjs';
import { LOCAL_DIR, loadDotEnv, loadRefuted, sealedReports } from './lib/store.mjs';

const DRY = process.argv.includes('--dry');
const OUT_DIR = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');
const PREV_DIR = process.env.QA_PREV_DIR || join(LOCAL_DIR, 'prev');
const SCHEMA_CHARS = JSON.stringify(REVIEW_SCHEMA).length;
const PRICE = PRICES[QA_FULL_MODEL];

async function main() {
  const env = DRY ? { ...loadDotEnv(), ...process.env } : process.env;
  const secret = env.QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not set. The report is never written unsealed.');

  // Only an earlier full review carries findings forward; a delta report from dev is a different ledger.
  const previous = sealedReports(PREV_DIR, secret, 'qa-full.enc.json')[0] || null;
  const refuted = loadRefuted(secret);
  const head = git(['rev-parse', commitIdOrNull(env.QA_HEAD) || 'HEAD']);

  const secretHits = [];
  const clean = (path, text) => {
    const r = redactSecrets(text);
    for (const h of r.hits) secretHits.push({ path, ...h });
    return r.text;
  };

  // Numbered before redaction, so a redacted multi-line block cannot shift the line numbers after it.
  const files = filesAt(head).map((f) => ({ ...f, diff: clean(f.path, numbered(f.content)), callers: [] }));
  const map = projectMap(files);
  const system = fullBrief(loadBrief());
  const previousOpen = (previous?.findings || []).filter((f) => !isSuppressed(f, refuted));
  const shared = { head, map, previousOpen, refuted };
  // As in the delta review: the register travels with its files, not with every batch.
  for (const f of files) f.carriedChars = carriedChars(f, shared);
  const baseChars = system.length + SCHEMA_CHARS + buildFullUserMessage({ ...shared, batch: { files: [] }, batchIndex: 0, batchCount: 1 }).length;
  const { batches, notReviewed, estimatedCostUsd } = packBatches(files, baseChars, { budget: FULL_BUDGET, price: PRICE });

  if (DRY) {
    console.log(
      JSON.stringify(
        {
          head,
          model: QA_FULL_MODEL,
          files: files.length,
          chars: files.reduce((n, f) => n + f.diff.length, 0),
          register: { open: previousOpen.length, refuted: refuted.length },
          baseChars,
          batches: batches.map((b) => ({ files: b.files.length, chars: b.chars, first: b.files[0]?.path })),
          notReviewed,
          estimatedCostUsd,
          capUsd: FULL_BUDGET.maxCostUsd,
          redactedSecrets: secretHits.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const run = await reviewBatches({
    batches,
    capUsd: FULL_BUDGET.maxCostUsd,
    // Last line of defence before anything leaves the runner, as in the delta review.
    messageFor: (batch, i) => ({
      system: clean('outgoing message', system),
      user: clean('outgoing message', buildFullUserMessage({ ...shared, batch, batchIndex: i, batchCount: batches.length })),
      shown: carriedFor(batch.files, shared).open.map((f) => f.fingerprint),
    }),
    fits: (spent, chars) => withinBudget(spent, chars + SCHEMA_CHARS, { budget: FULL_BUDGET, price: PRICE }),
    worstCase: (chars) => estimateCostUsd(chars + SCHEMA_CHARS, 1, { price: PRICE, maxOutputTokens: FULL_BUDGET.maxOutputTokens }),
    call: ({ system: s, user }) =>
      callReviewer({
        apiKey: env.OPENROUTER_API_KEY,
        system: s,
        user,
        schema: REVIEW_SCHEMA,
        effort: FULL_BUDGET.effort,
        model: QA_FULL_MODEL,
        maxTokens: FULL_BUDGET.maxOutputTokens,
        name: 'qa_full_review',
        title: 'Clean-Core.io QA Full Review',
        timeoutMs: FULL_BUDGET.requestTimeoutMs,
      }),
  });
  const { results, failedCalls } = run;
  notReviewed.push(...run.notReviewed);
  const modelCalls = results.length;
  // A failed call may still have been billed, and its cost is not reported: then the total is unknown, not the sum of the rest.
  const costUsd = failedCalls ? null : actualCost(results.map((r) => r.usage));

  const secretFindings = secretHits.filter((h) => !isPublicByDesign(h)).map((h) => ({
    severity: 'critical',
    category: 'security',
    file: h.path,
    line: 0,
    title: `Possible ${h.kind} committed`,
    failure_scenario: `${h.count} value(s) matching a ${h.kind} pattern are in the release. Anyone who can read the repository can use them until they are rotated.`,
    evidence: 'Redacted before the code left the runner; the value is not in this report.',
    suggested_fix: 'Rotate the credential first, then remove it from the file and from history, and move it to a secret store.',
    confidence: 0.9,
  }));
  if (secretFindings.length) results.push({ review: { verdict: 'no_go', summary: '', findings: secretFindings, acceptance: [], test_gaps: [], previous_findings: [], coverage_notes: '' }, files: [] });

  const report = buildReport({
    range: { base: null, head, commits: [], baseReason: 'full review of the release' },
    results,
    previous: modelCalls ? previous : { findings: previousOpen },
    refuted,
    notReviewed,
    triage: { tags: [...new Set(files.flatMap((f) => f.tags))], signals: [], codeWithoutTests: false },
    meta: {
      mode: 'full',
      run: { id: env.GITHUB_RUN_ID || null, attempt: env.GITHUB_RUN_ATTEMPT || null },
      model: QA_FULL_MODEL,
      effort: FULL_BUDGET.effort,
      modelCalls,
      estimatedCostUsd,
      costUsd,
      failedCalls,
      budget: { maxCostUsd: FULL_BUDGET.maxCostUsd, maxBatches: FULL_BUDGET.maxBatches },
      files: files.length,
      redactedSecrets: secretHits.length,
    },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'qa-full.enc.json'), JSON.stringify(seal(report, secret)));

  const summary = publicSummary(report);
  console.log(`QA full review ${summary.head}: ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd}`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### QA full review\n\n\`${summary.head}\` — ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd}\n\nThe report is sealed. Read it locally with \`node scripts/qa/await.mjs <sha> --full\`.\n`);
  }
}

main().catch((err) => {
  // Only the message: a stack or a response body could carry code or findings into a public log.
  console.error(`QA full review failed: ${err?.message || err}`);
  process.exit(1);
});
