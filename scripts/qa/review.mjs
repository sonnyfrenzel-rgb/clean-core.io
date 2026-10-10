#!/usr/bin/env node
/**
 * QA review of one delta on `dev` — the CI entry point (.github/workflows/qa-review.yml).
 *
 *   node scripts/qa/review.mjs            CI: one sealed report, a public line that says only that it ran
 *   node scripts/qa/review.mjs --local    maintainer: reads .env.local, also writes and prints the plaintext locally
 *   node scripts/qa/review.mjs --dry      maintainer: delta, triage, batches and estimated cost — no model call
 *
 * Guardrails (docs/QA-REVIEW-LOOP.md §2): reads the repository, calls the pinned
 * model (MODELS.delta) on OpenRouter without tools, writes one sealed file. It never writes to the
 * repository, to GitHub or to any other system.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, EFFORT, estimateCostUsd, MODELS, publicByDesignValues, withinBudget } from './lib/config.mjs';
import { seal } from './lib/crypto.mjs';
import { advanceCheckpoint, advanceNote } from './lib/checkpoint.mjs';
import { addedLines, callersOf, changedFiles, chooseBase, commitIdOrNull, commitMessages, fileDiff, git, isAncestor, isClaimSource, isReviewable, mergeBaseWithMain, resolveRange, touchedSymbols } from './lib/git-delta.mjs';
import { callReviewer, modelsOf } from './lib/openrouter.mjs';
import { isCutOff, packBatches, partLabel, partsOf, splitBatch } from './lib/pack.mjs';
import { buildUserMessage, carriedChars, carriedFor, loadBrief, REVIEW_SCHEMA } from './lib/prompt.mjs';
import { redactSecrets } from './lib/redact.mjs';
import { actualCost, buildReport, isSuppressed, publicSummary, renderText } from './lib/report.mjs';
import { LOCAL_DIR, loadDotEnv, loadRefuted, sealedReports } from './lib/store.mjs';
import { triage as runTriage } from './lib/triage.mjs';

const LOCAL = process.argv.includes('--local') || process.argv.includes('--dry');
const DRY = process.argv.includes('--dry');
const OUT_DIR = process.env.QA_OUT_DIR || join(LOCAL_DIR, 'out');
const PREV_DIR = process.env.QA_PREV_DIR || join(LOCAL_DIR, 'prev');
/** Reports of manual slice runs on dev and the latest full review on main — read only to move the checkpoint (checkpoint.mjs). */
const SLICES_DIR = process.env.QA_SLICES_DIR || join(LOCAL_DIR, 'slices');
const FULL_DIR = process.env.QA_FULL_DIR || join(LOCAL_DIR, 'full');
/** The response schema travels with every request and is billed as input. */
const SCHEMA_CHARS = JSON.stringify(REVIEW_SCHEMA).length;

async function main() {
  const env = LOCAL ? { ...loadDotEnv(), ...process.env } : process.env;
  const secret = env.QA_REVIEW_KEY;
  if (!secret) throw new Error('QA_REVIEW_KEY is not set. The report is never written unsealed.');

  const lastPush = sealedReports(PREV_DIR, secret)[0] || null;
  const refuted = loadRefuted(secret);

  // Delta since the last reviewed checkpoint; without a usable one, everything not yet on main (chooseBase).
  const head = git(['rev-parse', commitIdOrNull(env.QA_HEAD) || 'HEAD']);
  // An incomplete review keeps the checkpoint where it was, so unread code comes round again — unless a complete
  // manual slice starting exactly there, or a complete full review of a release on main, has read further
  // (checkpoint.mjs; a slice that starts anywhere else is ignored).
  const advance = advanceCheckpoint({
    checkpoint: lastPush?.range?.checkpoint ?? lastPush?.range?.head,
    head,
    findings: lastPush?.findings || [],
    slices: sealedReports(SLICES_DIR, secret),
    fullReviews: sealedReports(FULL_DIR, secret, 'qa-full.enc.json'),
    isAncestorOf: isAncestor,
  });
  // The findings of adopted slices are carried like a push review's.
  const previous = lastPush && advance.adopted.length ? { ...lastPush, findings: advance.findings } : lastPush;
  const chosen = chooseBase({
    head,
    overrideBase: commitIdOrNull(env.QA_BASE_OVERRIDE),
    checkpoint: advance.checkpoint,
    isAncestorOf: isAncestor,
    mainBase: mergeBaseWithMain,
    // A checkpoint hundreds of commits back is a stray report, not this branch's last review (git-delta.mjs).
    commitsBetween: (from, to) => Number(git(['rev-list', '--count', `${from}..${to}`])),
  });
  const range = resolveRange({ base: chosen.base, head });
  if (range.base === chosen.base) range.baseReason = chosen.base === advance.checkpoint && advanceNote(advance) ? `${chosen.reason} (${advanceNote(advance)})` : chosen.reason;

  const secretHits = [];
  const publicValues = publicByDesignValues();
  const clean = (path, text) => {
    const r = redactSecrets(text, publicValues);
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
      // Redacted whole, before a large diff is cut into parts, so no credential can straddle a cut.
      const diff = clean(f.path, fileDiff(range, f.path).text);
      diffs.set(f.path, diff);
      return { ...f, diff };
    });

  const triage = runTriage(files, diffs, claimText);
  const tags = new Map(triage.files.map((f) => [f.path, f.tags]));
  for (const f of files) {
    f.tags = tags.get(f.path) || [];
    f.callers = callersOf(range, touchedSymbols(f.diff), changedPaths).map((c) => ({ ...c, callers: c.callers.map((x) => ({ ...x, text: clean(x.file, x.text) })) }));
  }

  const system = loadBrief();
  const previousOpen = (previous?.findings || []).filter((f) => !isSuppressed(f, refuted));
  const shared = { range, triage, claims: claimText, previousOpen, refuted };
  // The register goes only to the batch that holds its file (prompt.mjs carriedFor), so it is counted with that
  // file: the part every batch repeats no longer grows with the number of open findings and refutations.
  for (const f of files) f.carriedChars = carriedChars(f, shared);
  const baseChars = system.length + buildUserMessage({ ...shared, batch: { files: [] }, batchIndex: 0, batchCount: 1 }).length;
  // A diff above maxFileDiffChars is packed as consecutive parts; a file counts as read only when all of them were.
  const entries = files.flatMap((f) => partsOf(f));
  const { batches, notReviewed, estimatedCostUsd } = packBatches(entries, baseChars);
  const effort = triage.elevated ? EFFORT.elevated : EFFORT.normal;

  if (DRY) {
    // Everything up to the model call, and nothing sent. For checking a delta's size and cost before pushing.
    console.log(
      JSON.stringify(
        {
          range: { base: range.base, head: range.head, baseReason: range.baseReason, commits: range.commits.length },
          checkpointAdvance: { adopted: advance.adopted, fullReview: advance.fullReview },
          changedFiles: all.length,
          reviewable: files.map((f) => `${f.path} [${f.tags.join(',')}] ${f.diff.length}ch callers:${f.callers.length} parts:${entries.filter((e) => e.path === f.path).length}`),
          triage: { tags: triage.tags, elevated: triage.elevated, signals: triage.signals.length, criteria: triage.criteria.length, codeWithoutTests: triage.codeWithoutTests },
          register: { open: previousOpen.length, refuted: refuted.length },
          baseChars,
          batches: batches.map((b) => ({ entries: b.files.map((f) => (f.part ? `${f.path} part ${partLabel(f)}` : f.path)), chars: b.chars, carriedOpen: carriedFor(b.files, shared).open.length })),
          notReviewed,
          effort,
          model: MODELS.delta,
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
  let cutOffCalls = 0;
  for (let i = 0; i < batches.length; i++) {
    // Last line of defence before anything leaves the runner: whatever part of
    // the message the per-source redaction missed is caught here and reported.
    const outgoingSystem = clean('outgoing message', system);
    const user = clean('outgoing message', buildUserMessage({ ...shared, batch: batches[i], batchIndex: i, batchCount: batches.length }));
    if (!withinBudget(spentForCap, outgoingSystem.length + user.length + SCHEMA_CHARS)) {
      for (const b of batches.slice(i)) for (const f of b.files) notReviewed.push({ path: f.path, ...(f.part ? { part: partLabel(f) } : {}), reason: `outside the $${BUDGET.maxCostUsd} cost cap` });
      break;
    }
    let r;
    try {
      r = await callReviewer({ apiKey: env.OPENROUTER_API_KEY, system: outgoingSystem, user, schema: REVIEW_SCHEMA, effort, model: MODELS.delta.model, price: MODELS.delta.price });
    } catch (err) {
      if (!isCutOff(err)) throw err;
      // Out of output tokens: the batch is read again as two halves, right after this one, instead of failing the
      // whole review (pack.mjs splitBatch). The call was paid for, and its full output allowance counts against the cap.
      cutOffCalls++;
      spentForCap += estimateCostUsd(outgoingSystem.length + user.length, 1);
      const halves = splitBatch(batches[i], baseChars);
      if (halves) batches.splice(i + 1, 0, ...halves);
      else for (const f of batches[i].files) notReviewed.push({ path: f.path, ...(f.part ? { part: partLabel(f) } : {}), reason: 'the model ran out of output tokens on this entry alone' });
      continue;
    }
    spentForCap += typeof r.usage?.cost === 'number' ? r.usage.cost : estimateCostUsd(outgoingSystem.length + user.length, 1);
    // `shown`: the carried findings this batch was given — the only ones it may mark resolved (report.mjs).
    results.push({ ...r, files: [...new Set(batches[i].files.map((f) => f.path))], shown: carriedFor(batches[i].files, shared).open.map((f) => f.fingerprint) });
  }
  const modelCalls = results.length;
  // Before the secret findings join the results: they come from no model.
  const models = modelsOf(results);
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
      // A re-run keeps the run id; the attempt tells its results apart from an earlier attempt's.
      run: { id: env.GITHUB_RUN_ID || null, attempt: env.GITHUB_RUN_ATTEMPT || null },
      // `model` is the pinned model, `models` who answered.
      model: MODELS.delta.model,
      price: MODELS.delta.price,
      models,
      effort,
      modelCalls,
      // Calls that ran out of output tokens and were split (not counted in modelCalls: they returned no review).
      cutOffCalls,
      estimatedCostUsd,
      costUsd, // null when OpenRouter did not report the cost of every call
      budget: { maxCostUsd: BUDGET.maxCostUsd, maxBatches: BUDGET.maxBatches },
      skipped: files.length ? null : range.base === range.head ? 'nothing to review — the head was already reviewed completely' : 'no reviewable code in the delta — prose, assets or generated files only',
      // What moved the checkpoint past the last push review (checkpoint.mjs): adopted slices, a full review on main.
      checkpointAdvance: advance.adopted.length || advance.fullReview ? { from: lastPush?.range?.checkpoint ?? null, adopted: advance.adopted, fullReview: advance.fullReview } : null,
      changedFiles: all.length,
      redactedSecrets: secretHits.length,
    },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'qa-review.enc.json'), JSON.stringify(seal(report, secret)));
  // The artifact is named after the reviewed head, not the dispatched ref, so a slice's result is found by its head
  // (await.mjs --slice). A commit id is public; nothing else goes out here.
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `head=${range.head}\n`);

  const summary = publicSummary(report);
  console.log(`QA review ${summary.head}: ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd} · ${summary.models}`);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### QA review\n\n\`${summary.head}\` — ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd} · reviewed by ${summary.models}\n\nThe report is sealed. Read it locally with \`node scripts/qa/await.mjs\`.\n`);
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
