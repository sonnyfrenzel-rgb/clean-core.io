import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * Workflows and pull requests.
 *
 * The opt-in AI review on pull requests (`.github/workflows/grok-review.yml`) was
 * removed by owner decision of 22.10.2026 (SEC-2026-906). A pull request from a
 * branch of this repository controls the workflow files it runs, so no job that a
 * pull request can start may hold a credential beyond the run's own read token.
 *
 * What is guarded here: the review workflow stays gone; nothing listens on
 * `pull_request_target`; every job of a workflow that a pull request triggers
 * either holds no secret or is kept off pull-request events by its `if:`; and no
 * workflow pipes a remote download into a shell.
 */
const ROOT = path.resolve(__dirname, '..');
const WF_DIR = path.resolve(ROOT, '.github/workflows');
const read = (file: string) => fs.readFileSync(path.join(WF_DIR, file), 'utf8');
const workflows = () => fs.readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));

/** Runnable text only: comments may quote what is forbidden. */
const runnable = (src: string) =>
  src
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');

/** The `on:` block of a workflow. */
function triggers(src: string): string {
  const start = src.search(/^on:[ \t]*$/m);
  if (start < 0) return '';
  const rest = src.slice(src.indexOf('\n', start) + 1);
  const next = rest.search(/^[a-z]+:/m);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Every job under `jobs:` as name → text. */
function jobs(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const body = src.slice(src.search(/^jobs:\s*$/m));
  const re = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
  const starts = [...body.matchAll(re)];
  starts.forEach((m, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : body.length;
    out.set(m[1], body.slice(m.index, end));
  });
  return out;
}

test('the pull-request review workflow is gone', () => {
  expect(fs.existsSync(path.join(WF_DIR, 'grok-review.yml'))).toBe(false);
  for (const file of workflows()) {
    expect(runnable(read(file)), `${file} hands out the model key of the removed review`).not.toContain('XAI_API_KEY');
  }
});

test('no workflow listens on pull_request_target', () => {
  for (const file of workflows()) expect(triggers(read(file)), file).not.toMatch(/pull_request_target/);
});

test('a job that a pull request can start holds no secret', () => {
  let checked = 0;
  for (const file of workflows()) {
    const src = runnable(read(file));
    if (!/^\s+pull_request:?/m.test(triggers(src))) continue;
    for (const [name, text] of jobs(src)) {
      const secrets = [...text.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((m) => m[1]).filter((s) => s !== 'GITHUB_TOKEN');
      if (secrets.length === 0) continue;
      checked++;
      const cond = text.match(/^ {4}if:[\s\S]*?(?=^ {4}[a-z-]+:)/m)?.[0] ?? '';
      expect(cond, `${file} job ${name} holds ${secrets.join(', ')} and runs on a pull request`).toMatch(/github\.event_name == '/);
      expect(cond, `${file} job ${name} holds ${secrets.join(', ')} and admits a pull request`).not.toMatch(/pull_request/);
    }
  }
  // The check must have looked at something, or it proves nothing: Security CI's alert job holds two secrets.
  expect(checked).toBeGreaterThan(0);
});

test('no workflow pipes a remote download into a shell', () => {
  for (const file of workflows()) {
    expect(runnable(read(file)), `${file} pipes a download into a shell`).not.toMatch(/\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/);
  }
});
