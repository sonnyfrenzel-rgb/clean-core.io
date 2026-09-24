#!/usr/bin/env node
/**
 * UX review — the CI entry point (.github/workflows/ux-review.yml, job `review`).
 *
 *   node scripts/ux/review.mjs                      CI: mode from UX_MODE — auto | full | delta | self-test (auto: see resolveMode)
 *   node scripts/ux/review.mjs --local --mode=full  maintainer: reads .env.local, also writes and prints the plaintext
 *   node scripts/ux/review.mjs --dry --mode=full    maintainer: batches, screenshots and estimated cost — no model call
 *
 * Guardrails (docs/UX-REVIEW-AGENT.md §2): reads the repository and the
 * screenshots, calls one pinned model without tools, writes one sealed file.
 * It never writes to the repository, to GitHub or to any other system.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seal } from '../qa/lib/crypto.mjs';
import { changedFiles, commitIdOrNull, git, isAncestor, isCommit } from '../qa/lib/git-delta.mjs';
import { callReviewer } from '../qa/lib/openrouter.mjs';
import { redactSecrets } from '../qa/lib/redact.mjs';
import { loadDotEnv, sealedReports } from '../qa/lib/store.mjs';
import { assignAreas, numbered, packAreas } from './lib/areas.mjs';
import { AREAS, BUDGETS, DIFF_CONTEXT_LINES, estimateCostUsd, isUxRelevant, MAX_IMAGE_BYTES_PER_CALL, MOCKUP_SCREENS, mockupScreen, REFERENCE_SCREENS, REQUEST_TIMEOUT_MS, baselineOf, resolveMode, UX_MODEL, WHOLE_FILE_CHARS, withinBudget } from './lib/config.mjs';
import { buildText, loadBrief, UX_SCHEMA } from './lib/prompt.mjs';
import { chooseDeltaBase } from './lib/range.mjs';
import { closedBy, loadRegister, refutedEntries } from './lib/register.mjs';
import { actualCost, buildReport, fingerprint, publicSummary, renderText } from './lib/report.mjs';
import { designScan, introducedTokens, renderScan } from './lib/scan.mjs';
import { imageParts, loadShots, pickShots } from './lib/shots.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const LOCAL = process.argv.includes('--local') || process.argv.includes('--dry');
const DRY = process.argv.includes('--dry');
const WORK = '.ux-review';
const OUT_DIR = process.env.UX_OUT_DIR || join(WORK, 'out');
const PREV_DIR = process.env.UX_PREV_DIR || join(WORK, 'prev');
const SHOTS_DIR = process.env.UX_SHOTS_DIR || join(WORK, 'shots');
const SCHEMA_CHARS = JSON.stringify(UX_SCHEMA).length;

const show = (commit, path) => git(['show', `${commit}:${path}`]);

/** Every UX file as it is at `commit` — read from git, so a CI checkout and a local run see the same thing. */
function uxFilesAt(commit) {
  return git(['ls-tree', '-r', '--name-only', commit])
    .split('\n')
    .filter((p) => p && isUxRelevant(p))
    .map((path) => ({ path, text: show(commit, path) }));
}

/** Earlier reviews whose head this commit contains, newest first — self-tests included, for the baseline they carry. */
function earlierReports(secret, head) {
  if (!secret) return [];
  return sealedReports(PREV_DIR, secret, 'ux-review.enc.json').filter((r) => r.range?.head && (r.range.head === head || (isCommit(r.range.head) && isAncestor(r.range.head, head))));
}

/**
 * A removed file is a change users meet too — a route that now 404s, a component
 * a screen no longer shows. It goes to the reviewer as what was there, not as
 * nothing (finding 25c4ed925224).
 */
function deletionBlock(base, path) {
  // Whole: a cut here would pass as read. Size is the batch limit's job, and it records a cut (finding a064a718fbb9).
  return `=== REMOVED ${path} in this release — its last content follows ===\n${numbered(path, show(base, path))}`;
}

/** A changed file for the reviewer: whole when small, otherwise its diff with generous context. */
function deltaBlock(base, head, path) {
  const text = show(head, path);
  if (text.length <= WHOLE_FILE_CHARS) return numbered(path, text);
  const diff = git(['diff', `-U${DIFF_CONTEXT_LINES}`, '-M', base, head, '--', path]);
  return `=== DIFF ${path} (file has ${text.split('\n').length} lines; hunk headers give line numbers) ===\n${diff}\n`;
}

async function main() {
  const env = LOCAL ? { ...loadDotEnv(), ...process.env } : process.env;
  const secret = env.UX_REVIEW_KEY;
  if (!secret && !DRY) throw new Error('UX_REVIEW_KEY is not set. The report is never written unsealed.');
  const head = git(['rev-parse', commitIdOrNull(env.UX_HEAD) || 'HEAD']);
  const reports = earlierReports(secret, head);
  const trigger = env.UX_TRIGGER === 'agent' ? 'agent' : 'release';
  const mode = resolveMode(arg('mode') || env.UX_MODE || 'delta', trigger, reports);
  const baseline = baselineOf(reports);
  const budget = BUDGETS[mode];
  if (!budget) throw new Error('UX_MODE must be auto, full, delta or self-test.');

  const files = uxFilesAt(head);
  const scan = designScan(files);
  const shots = loadShots(SHOTS_DIR);
  const register = loadRegister();
  const closed = closedBy(register);
  const refuted = refutedEntries(register);
  const previous = reports.find((r) => r.mode !== 'self-test') || null;
  const assignment = assignAreas(files);

  const secretHits = [];
  const clean = (text) => {
    const r = redactSecrets(text);
    secretHits.push(...r.hits);
    return r.text;
  };
  const brief = clean(loadBrief());

  /** One planned model call. */
  const calls = [];
  const notReviewed = [];
  let range = { base: null, head, commits: [git(['log', '-1', '--format=%h %s', head])] };
  let skipped = null;

  if (mode === 'full') {
    const scanText = renderScan(scan);
    for (const batch of packAreas(files, assignment, budget.maxBatchChars)) {
      const screens = batch.area === 'system' ? [...REFERENCE_SCREENS, ...MOCKUP_SCREENS] : batch.screens;
      calls.push({ kind: 'area', batch, screens, picked: pickShots(shots, screens, { limit: budget.maxImagesPerCall, maxBytes: MAX_IMAGE_BYTES_PER_CALL }), scanText, effort: budget.effort });
    }
  } else {
    const chosen =
      mode === 'self-test'
        ? { base: isCommit(`${head}~3`) ? git(['rev-parse', `${head}~3`]) : null, reason: 'Selbsttest: die letzten drei Commits' }
        : chooseDeltaBase({ head, override: commitIdOrNull(env.UX_BASE_OVERRIDE), checkpoint: previous?.range?.checkpoint, before: commitIdOrNull(env.UX_BEFORE), isAncestorOf: isAncestor, exists: isCommit });
    if (chosen.base) chosen.base = git(['rev-parse', chosen.base]);
    range = { base: chosen.base, head, baseReason: chosen.reason, commits: chosen.base && chosen.base !== head ? git(['log', '--format=%h %s', `${chosen.base}..${head}`]).split('\n').filter(Boolean).map(clean) : [] };

    const changed = chosen.base && chosen.base !== head ? changedFiles(range).filter((f) => isUxRelevant(f.path)) : [];
    const present = changed.filter((f) => f.status !== 'D');
    let blocks = [
      ...present.map((f) => ({ path: f.path, block: deltaBlock(range.base, head, f.path) })),
      ...changed.filter((f) => f.status === 'D').map((f) => ({ path: f.path, block: deletionBlock(range.base, f.path) })),
    ];
    for (const b of blocks) {
      if (b.block.length <= budget.maxBatchChars || mode === 'self-test') continue;
      b.block = `${b.block.slice(0, budget.maxBatchChars)}\n… [cut at ${budget.maxBatchChars} characters]\n`;
      notReviewed.push({ path: b.path, reason: `Diff über ${budget.maxBatchChars} Zeichen — nur der Anfang gelesen` });
    }
    if (mode === 'self-test') {
      // The chain once, small: one changed file that fits, or a fixed sample.
      const fits = blocks.filter((b) => b.block.length <= budget.maxBatchChars);
      blocks = (fits.length ? fits : [{ path: 'components/StageHeader.tsx', block: numbered('components/StageHeader.tsx', show(head, 'components/StageHeader.tsx')) }]).slice(0, 1);
    }

    if (!blocks.length) {
      skipped = chosen.base === head ? 'dieser Stand ist bereits geprüft' : 'keine für Nutzer sichtbare Änderung in diesem Release';
    } else {
      const added = chosen.base && present.length ? git(['diff', '-U0', range.base, head, '--', ...present.map((f) => f.path)]).split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n') : '';
      const scanText = renderScan(scan, { introduced: introducedTokens(added, scan) });
      // A removed file is not in today's assignment; its area comes from its path, or the design system.
      const areaOf = (path) => assignment.get(path) || AREAS.find((a) => a.pages.some((re) => re.test(path)))?.id || 'system';
      const areas = [...new Set(blocks.map((b) => areaOf(b.path)))];
      const screens = [...new Set([...areas.flatMap((a) => AREAS.find((x) => x.id === a)?.screens || []), ...REFERENCE_SCREENS.slice(0, 2)])];
      const notes = changed.filter((f) => f.status === 'D').map((f) => `Removed in this release: ${f.path} (its last content is in the source below)`);

      let current = null;
      for (const b of blocks) {
        if (!current || current.chars + b.block.length > budget.maxBatchChars) {
          if (calls.length >= budget.maxBatches) {
            notReviewed.push({ path: b.path, reason: `mehr als ${budget.maxBatches} Aufrufe für dieses Release` });
            continue;
          }
          current = { area: 'release', title: null, part: null, files: [], blocks: [], chars: 0 };
          calls.push({ kind: 'delta', batch: current, screens, picked: pickShots(shots, screens, { limit: budget.maxImagesPerCall, maxBytes: MAX_IMAGE_BYTES_PER_CALL }), scanText, notes, effort: budget.effort });
        }
        current.files.push(b.path);
        current.blocks.push(b.block);
        current.chars += b.block.length;
      }
    }
  }

  // Pictures count per screen a call asks for, and only if they are in the call itself — not whether a
  // file arrived: one surviving screenshot of the access dialog is no visual evidence for Analyse, and
  // an image the byte limit left out was never seen (findings a553413f50d9, 115d8f705a0d). The
  // mockups are the target picture — wanted, not required.
  const missingPictures = new Set();
  const notePictures = (c) => {
    for (const screen of c.screens || []) {
      if (!MOCKUP_SCREENS.includes(screen) && !c.picked.some((s) => s.screen === screen && s.viewport === 'desktop')) missingPictures.add(screen);
    }
  };
  if (mode !== 'self-test') for (const c of calls) notePictures(c);

  const previousOpen = mode === 'delta' ? (previous?.findings || []).filter((f) => !closed(f)).slice(0, 60) : [];
  const textFor = (c, extra = {}) => clean(buildText({ mode: c.kind === 'synthesis' ? 'synthesis' : mode, batch: c.batch, scanText: c.scanText, range, shots: c.picked, previousOpen, refuted, notes: c.notes, ...extra }));

  if (DRY) {
    console.log(
      JSON.stringify(
        {
          mode,
          range: { base: range.base, head: range.head, baseReason: range.baseReason, commits: range.commits.length },
          skipped,
          previous: previous ? { head: previous.range.head, mode: previous.mode } : null,
          screenshots: shots.length,
          calls: calls.map((c) => ({ area: c.batch.area, part: c.batch.part, files: c.batch.files, chars: textFor(c).length, images: c.picked.map((s) => s.name) })),
          synthesis: mode === 'full',
          estimatedCostUsd: Number((calls.reduce((n, c) => n + estimateCostUsd({ chars: brief.length + textFor(c).length + SCHEMA_CHARS, images: c.picked.length, maxOutputTokens: budget.maxOutputTokens }), 0) + (mode === 'full' ? estimateCostUsd({ chars: 60_000, images: 20, maxOutputTokens: budget.maxOutputTokens }) : 0)).toFixed(2)),
          notReviewed: [...notReviewed, ...[...missingPictures].map((screen) => ({ path: `(Screenshot ${screen})`, reason: 'nicht im Aufruf' }))],
          baseline,
        },
        null,
        2,
      ),
    );
    return;
  }

  const results = [];
  const usages = [];
  let spent = 0;
  const run = async (c, text, effort) => {
    if (!withinBudget(budget, spent, { chars: brief.length + text.length + SCHEMA_CHARS, images: c.picked.length })) return null;
    const r = await callReviewer({
      apiKey: env.OPENROUTER_API_KEY,
      model: UX_MODEL,
      name: 'ux_review',
      title: 'Clean-Core.io UX Review',
      system: brief,
      user: [{ type: 'text', text }, ...imageParts(c.picked)],
      schema: UX_SCHEMA,
      effort,
      maxTokens: budget.maxOutputTokens,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    usages.push(r.usage);
    spent += typeof r.usage?.cost === 'number' ? r.usage.cost : estimateCostUsd({ chars: brief.length + text.length + SCHEMA_CHARS, images: c.picked.length, maxOutputTokens: budget.maxOutputTokens });
    return r;
  };

  for (const c of calls) {
    const r = await run(c, textFor(c), c.effort);
    if (!r) {
      for (const path of c.batch.files) notReviewed.push({ path, reason: `außerhalb der Kostengrenze von $${budget.maxCostUsd}` });
      continue;
    }
    results.push({ review: r.review, batch: c.batch, shots: c.picked.map((s) => s.name) });
  }

  let synthesis = null;
  if (mode === 'full' && results.length) {
    const areaFindings = results.flatMap(({ review, batch }) => review.findings.map((f) => ({ ...f, area: batch.area, fingerprint: fingerprint({ ...f, area: batch.area }) })));
    // Of the mockups, the synthesis sees the three views the product is judged against end to end:
    // the first look, the Business view with the process, and the decision.
    const screens = [...new Set([...AREAS.flatMap((a) => a.screens), ...['s0', 's1', 's5'].map(mockupScreen)])];
    // A contact sheet: the first screen height of every screen, desktop — the view that shows drift between areas.
    const firstViews = shots.filter((s) => s.viewport === 'desktop' && s.segment === 1);
    const c = { kind: 'synthesis', batch: null, screens, picked: pickShots(firstViews, screens, { limit: budget.maxImagesPerCall + 8, maxBytes: MAX_IMAGE_BYTES_PER_CALL * 1.5 }), scanText: renderScan(scan) };
    const r = await run(c, textFor(c, { areaFindings }), budget.synthesisEffort);
    if (r) {
      synthesis = { review: r.review, shots: c.picked.map((s) => s.name) };
      notePictures(c);
    }
  }
  for (const screen of missingPictures) notReviewed.push({ path: `(Screenshot ${screen})`, reason: 'nicht im Aufruf — dieser Screen wurde nur im Code gesehen' });

  const report = buildReport({
    mode,
    range,
    results,
    synthesis,
    previous,
    closed,
    notReviewed,
    baseline,
    meta: {
      run: { id: env.GITHUB_RUN_ID || null, attempt: env.GITHUB_RUN_ATTEMPT || null },
      model: UX_MODEL,
      modelCalls: usages.length,
      costUsd: usages.length ? actualCost(usages) : 0,
      budget: { maxCostUsd: budget.maxCostUsd, maxBatches: budget.maxBatches },
      skipped,
      screenshotsAvailable: shots.length,
      uxFiles: files.length,
      redactedSecrets: secretHits.length,
    },
  });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, 'ux-review.enc.json'), JSON.stringify(seal(report, secret)));

  const summary = publicSummary(report);
  const line = `UX review ${summary.head} (${summary.mode}): ${summary.status} · ${summary.modelCalls} model call(s) · $${summary.costUsd}`;
  console.log(line);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### UX review\n\n${line}\n\nThe report is sealed. Read it locally with \`node scripts/ux/inbox.mjs\`.\n`);

  if (LOCAL) {
    writeFileSync(join(OUT_DIR, `ux-review.${head.slice(0, 12)}.json`), JSON.stringify(report, null, 2));
    console.log(`\n${renderText(report)}`);
  }
}

main().catch((err) => {
  // Only the message: a response body or delta content must not reach a public log.
  console.error(`UX review failed: ${String(err?.message || err).split('\n')[0]}`);
  process.exit(1);
});
