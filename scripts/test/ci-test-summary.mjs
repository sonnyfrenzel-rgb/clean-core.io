#!/usr/bin/env node
/**
 * Skipped and flaky tests, made visible per shard (release 3.0.21, test-quality measure 1).
 *
 * A green shard says nothing about the tests that did not run or that passed
 * only on a retry: the line reporter prints "27 skipped" and moves on, and a
 * retry that turned red into green leaves no trace at all. In CI Playwright
 * also writes a JSON report (playwright.config.ts); this script reads it and
 * appends to the job summary every skipped test with its reason and every test
 * that passed only on retry.
 *
 *   node scripts/test/ci-test-summary.mjs <report.json> --shard <i>
 *
 * Appends to $GITHUB_STEP_SUMMARY when set, prints to stdout otherwise. It
 * reports and never gates: every outcome, a missing or broken report included,
 * exits 0, so it cannot turn a shard red by itself (the workflow step also runs
 * with `continue-on-error`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cell = (s) =>
  String(s ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim();

/** Every test in the report with its file, title path and line. */
export function collectTests(report) {
  const out = [];
  const visit = (suite, titles, file) => {
    const f = suite.file || file;
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        out.push({
          file: String(spec.file || f || '').replace(/\\/g, '/'),
          line: spec.line,
          title: [...titles, spec.title].filter(Boolean).join(' › '),
          test,
        });
      }
    }
    for (const child of suite.suites || []) visit(child, [...titles, child.title], f);
  };
  // The top-level suites are the files; their title is the file name, not a describe.
  for (const s of report.suites || []) visit(s, [], s.file);
  return out;
}

/** The reasons given for a skip: test.skip(cond, 'reason'), test.fixme(…), annotations at run time. */
export function skipReasons(test) {
  const annotations = [...(test.annotations || []), ...(test.results || []).flatMap((r) => r.annotations || [])];
  const reasons = annotations
    .filter((a) => a && (a.type === 'skip' || a.type === 'fixme'))
    .map((a) => (a.description ? `${a.type}: ${a.description}` : a.type));
  return [...new Set(reasons)];
}

export function summarize(report, { shard } = {}) {
  const tests = collectTests(report);
  const skipped = tests.filter((t) => t.test.status === 'skipped');
  const flaky = tests.filter((t) => t.test.status === 'flaky');
  const label = shard ? `E2E shard ${shard}` : 'E2E';
  const lines = [`### ${label}: ${skipped.length} skipped, ${flaky.length} passed only on retry`, ''];
  if (skipped.length) {
    lines.push(`**Skipped (${skipped.length})**`, '', '| Test | Reason |', '| --- | --- |');
    for (const t of skipped) {
      const reasons = skipReasons(t.test);
      lines.push(`| \`${cell(t.file)}:${t.line ?? ''}\` ${cell(t.title)} | ${cell(reasons.join('; ') || 'no reason given')} |`);
    }
    lines.push('');
  }
  if (flaky.length) {
    lines.push(`**Passed only on retry (${flaky.length})**`, '', '| Test | Attempts | First error |', '| --- | --- | --- |');
    for (const t of flaky) {
      const results = t.test.results || [];
      const firstFail = results.find((r) => r.status !== 'passed' && r.status !== 'skipped');
      const message = firstFail?.error?.message || firstFail?.errors?.[0]?.message || firstFail?.status || '';
      lines.push(`| \`${cell(t.file)}:${t.line ?? ''}\` ${cell(t.title)} | ${results.length} | ${cell(stripAnsi(message).slice(0, 160))} |`);
    }
    lines.push('');
  }
  if (!skipped.length && !flaky.length) lines.push('Every test ran, and none needed a retry to pass.', '');
  return lines.join('\n');
}

function stripAnsi(s) {
  // Colour codes in Playwright's error messages: split on ESC rather than a control-character regex.
  const esc = String.fromCharCode(27);
  return String(s).split(esc).map((part, i) => (i === 0 ? part : part.replace(/^\[[0-9;]*m/, ''))).join('');
}

function main(argv) {
  const file = argv[0];
  const shardAt = argv.indexOf('--shard');
  const shard = shardAt >= 0 ? argv[shardAt + 1] : undefined;
  let text;
  try {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    text = summarize(report, { shard });
  } catch (e) {
    text = `### ${shard ? `E2E shard ${shard}` : 'E2E'}: no test report\n\nNo readable Playwright JSON report at \`${file}\` (${e.code || e.name}); the shard ended before Playwright wrote one.\n`;
  }
  const target = process.env.GITHUB_STEP_SUMMARY;
  try {
    if (target) fs.appendFileSync(target, `${text}\n`);
    else process.stdout.write(`${text}\n`);
  } catch (e) {
    console.error(`ci-test-summary: could not write the summary (${e.message})`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2));
  process.exit(0);
}
