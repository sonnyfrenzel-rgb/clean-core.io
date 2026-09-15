#!/usr/bin/env node
/**
 * QA review of one delta on `dev` — the CI entry point (.github/workflows/qa-review.yml).
 *
 *   node scripts/qa/review.mjs            CI: one sealed report, a public line that says only that it ran
 *   node scripts/qa/review.mjs --local    maintainer: reads .env.local, also writes and prints the plaintext locally
 *   node scripts/qa/review.mjs --dry      maintainer: delta, triage, batches and estimated cost — no model call
 *
 * Guardrails (docs/QA-REVIEW-LOOP.md §2): reads the repository, calls one pinned
 * model without tools, writes one sealed file. It never writes to the
 * repository, to GitHub or to any other system.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, EFFORT, estimateCostUsd, QA_MODEL, withinBudget } from './lib/config.mjs';
import { seal } from './lib/crypto.mjs';
import { addedLines, callersOf, changedFiles, commitIdOrNull, commitMessages, fileDiff, git, isAncestor, isClaimSource, isReviewable, mergeBaseWithMain, resolveRange, touchedSymbols } from './lib/git-delta.mjs';
import { callReviewer } from './lib/openrouter.mjs';
import { packBatches } from './lib/pack.mjs';
import { buildUserMessage, loadBrief, REVIEW_SCHEMA } from './lib/prompt.mjs';
import { redactSecrets } from './lib/redact.mjs';
import { actualCost, buildReport, publicSummary, renderText } from './lib/report.mjs';
import { LOCAL_DIR, loadDotEnv, loadRefuted, sealedReports } from './lib/store.mjs';
import { triage as runTriage } from './lib/triage.mjs';

const LOCAL = process.argv.includes('--local') || process.argv.includes('--dry');
const DRY = process.argv.includes('--dry');
const OUT_DIR = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');
const PREV_DIR = process.env.QA_PREV_DIR || join(LOCAL_DIR, 'prev');

async function main() {
  const env = LOCAL ? { ...loadDotEnv(), ...process.env } : process.env;
  const secret = env.QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not set. The report is never written unsealed.');

  const previous = sealedReports(PREV_DIR, secret)[0] || null;
  const refuted = loadRefuted(secret);

  // Delta since the last *reviewed* commit, not the last push: a push that
  // cancelled a running review must not leave its changes unreviewed. With no
  // reviewed checkpoint at all — the first run, or every earlier run failed or
  // was cancelled — the push's own `before` would silently drop those deltas,
  // so the review covers everything that is not on main yet instead (QA review
  // of 221f2d11768c, finding 398ae237c062).
  const head = git(['rev-parse', commitIdOrNull(env.QA_HEAD) || 'HEAD']);
  const prevHead = previous?.range?.head;
  let base = commitIdOrNull(env.QA_BASE);
  let baseReason = null;
  if (prevHead && prevHead !== head && isAncestor(prevHead, head)) {
    base = prevHead;
    baseReason = 'last reviewed commit';
  } else if (!previous) {
    const mainBase = mergeBaseWithMain(head);
    if (mainBase && mainBase !== head) {
      base = mainBase;
      baseReason = 'no reviewed checkpoint found — everything not yet on main';
    }
  }
  const range = resolveRange({ base, head });
  if (baseReason && range.base === base) range.baseReason = baseReason;

  const secretHits = [];
  const clean = (path, text) => {
    const r = redactSecrets(text);
    for (const h of r.hits) secretHits.push({ path, ...h });
    return r.text;
  };
  range.commits = range.commits.map((c) => clean('commit subjects', c));

  const all = changedFiles(range);
  const claimText = clean(
    'claims',
    [...all.filter((f) => isClaimSource(f.path) && f.status !== 'D').map((f) => `# ${f.path}\n${addedLines(range, f.path)}`), `# commits\n${commitMessages(range)}`].join('\n\n'),
  );

  const changedPaths = all.map((f) => f.path);
  const diffs = new Map();
  const files = all
    .filter((f) => isReviewable(f.path))
    .map((f) => {
      // Deletions get their diff too: the removed assertions and exports are the evidence.
      const d = fileDiff(range, f.path);
      const diff = clean(f.path, d.text);
      diffs.set(f.path, diff);
      return { ...f, diff, truncated: d.truncated };
    });

  const triage = runTriage(files, diffs, claimText);
  const tags = new Map(triage.files.map((f) => [f.path, f.tags]));
  for (const f of files) {
    f.tags = tags.get(f.path) || [];
    f.callers = callersOf(range, touchedSymbols(f.diff), changedPaths).map((c) => ({ ...c, callers: c.callers.map((x) => ({ ...x, text: clean(x.file, x.text) })) }));
  }

  const system = loadBrief();
  const refutedFps = new Set(refuted.map((r) => r.fingerprint));
  const previousOpen = (previous?.findings || []).filter((f) => !refutedFps.has(f.fingerprint));
  const shared = { range, triage, claims: claimText, previousOpen, refuted };
  const baseChars = system.length + buildUserMessage({ ...shared, batch: { files: [] }, batchIndex: 0, batchCount: 1 }).length;
  const { batches, notReviewed, estimatedCostUsd } = packBatches(files, baseChars);
  const effort = triage.elevated ? EFFORT.elevated : EFFORT.normal;

  if (DRY) {
    // Everything up to the model call, and nothing sent. For checking a delta's size and cost before pushing.
    console.log(
      JSON.stringify(
        {
          range: { base: range.base, head: range.head, baseReason: range.baseReason, commits: range.commits.length },
          changedFiles: all.length,
          reviewable: files.map((f) => `${f.path} [${f.tags.join(',')}] ${f.diff.length}ch callers:${f.callers.length}`),
          triage: { tags: triage.tags, elevated: triage.elevated, signals: triage.signals.length, criteria: triage.criteria.length, codeWithoutTests: triage.codeWithoutTests },
          batches: batches.map((b) => ({ files: b.files.length, chars: b.chars })),
          notReviewed,
          effort,
          estimatedCostUsd,
          redactedSecrets: secretHits.length,
        },
        null,
        2,
      ),
    );
    return;
  }

  const results = [];
  // What counts against the cap: reported cost where there is one, the
  // worst-case estimate where there is not — an unreported cost is never a zero.
  let spentForCap = 0;
  for (let i = 0; i < batches.length; i++) {
    // Last line of defence before anything leaves the runner: whatever part of
    // the message the per-source redaction missed is caught here and reported.
    const outgoingSystem = clean('outgoing message', system);
    const user = clean('outgoing message', buildUserMessage({ ...shared, batch: batches[i], batchIndex: i, batchCount: batches.length }));
    if (!withinBudget(spentForCap, outgoingSystem.length + user.length)) {
      for (const b of batches.slice(i)) for (const f of b.files) notReviewed.push({ path: f.path, reason: `outside the $${BUDGET.maxCostUsd} cost cap` });
      break;
    }
    const r = await callReviewer({ apiKey: env.OPENROUTER_API_KEY, system: outgoingSystem, user, schema: REVIEW_SCHEMA, effort });
    spentForCap += typeof r.usage?.cost === 'number' ? r.usage.cost : estimateCostUsd(outgoingSystem.length + user.length, 1);
    results.push({ ...r, files: batches[i].files.map((f) => f.path) });
  }
  const modelCalls = results.length;
  const costUsd = actualCost(results.map((r) => r.usage));

  // A credential in the delta is reported without a model and without its value.
  const secretFindings = secretHits.map((h) => ({
    severity: 'critical',
    category: 'security',
    file: h.path,
    line: 0,
    title: `Possible ${h.kind} committed`,
    failure_scenario: `${h.count} value(s) matching a ${h.kind} pattern are in the pushed delta. Anyone who can read the repository can use them until they are rotated.`,
    evidence: 'Redacted before the delta left the runner; the value is not in this report.',
    suggested_fix: 'Rotate the credential first, then remove it from the file and from history, and move it to a secret store.',
    confidence: 0.9,
  }));
  if (secretFindings.length) results.push({ review: { verdict: 'no_go', summary: '', findings: secretFindings, acceptance: [], test_gaps: [], previous_findings: [], coverage_notes: '' }, files: [] });

  const report = buildReport({
    range,
    results,
    // Without a model call nothing can be marked resolved, so every open finding is carried as it was.
    previous: modelCalls ? previous : { findings: previousOpen },
    refuted,
    notReviewed,
    triage,
    meta: {
      model: QA_MODEL,
      effort,
      modelCalls,
      estimatedCostUsd,
      costUsd, // null when OpenRouter did not report the cost of every call
      budget: { maxCostUsd: BUDGET.maxCostUsd, maxBatches: BUDGET.maxBatches },
      skipped: files.length ? null : 'no reviewable code in the delta — prose, assets or generated files only',
      changedFiles: all.length,
      redactedSecrets: secretHits.length,
    },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'qa-review.enc.json'), JSON.stringify(seal(report, secret)));

  const summary = publicSummary(report);
  console.log(`QA review ${summary.head}: ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd}`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### QA review\n\n\`${summary.head}\` — ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd}\n\nThe report is sealed. Read it locally with \`node scripts/qa/await.mjs\`.\n`);
  }

  if (LOCAL) {
    writeFileSync(join(OUT_DIR, `qa-review.${range.head.slice(0, 12)}.json`), JSON.stringify(report, null, 2));
    console.log(`\n${renderText(report)}`);
  }
}

main().catch((err) => {
  // Only the message: a stack or a response body could carry delta content into a public log.
  console.error(`QA review failed: ${err?.message || err}`);
  process.exit(1);
});
