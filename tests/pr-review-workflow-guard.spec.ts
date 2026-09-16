import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The opt-in AI review on pull requests (`.github/workflows/grok-review.yml`).
 *
 * It is the one workflow in this repository that reads content a contributor
 * controls and holds a credential while doing it, and it used to do both badly:
 *
 *   - `curl -fsSL https://x.ai/cli/install.sh | bash` — an unversioned script
 *     piped into a shell, whose output then ran with the model key beside it. A
 *     compromise anywhere in that delivery chain executed as us (QA review of
 *     33471220d6e9, finding a4f7e6aef79b).
 *   - `--always-approve`, which auto-approves every tool call the agent makes,
 *     over a diff the pull request controls, with a pull-request-writing
 *     GitHub token in the same step (finding 1e47826dd2c5).
 *
 * What is guarded here: nothing runs that was not pinned and checked; the step
 * that reads the pull request holds no repository credential and no blanket tool
 * approval; and the step that can write a comment runs no downloaded binary.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.resolve(ROOT, p), 'utf8');
const WF = '.github/workflows/grok-review.yml';

/** One `- name: …` step block, from its name to the next step at the same indent. */
function step(src: string, name: string): string {
  const start = src.indexOf(`      - name: ${name}`);
  expect(start, `no step named "${name}"`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.indexOf('\n      - name: ');
  return next < 0 ? rest : rest.slice(0, next);
}

test.describe('nothing runs that was not pinned and checked', () => {
  test('no workflow pipes a remote download into a shell', () => {
    for (const file of fs.readdirSync(path.resolve(ROOT, '.github/workflows'))) {
      const src = read(`.github/workflows/${file}`);
      // Comments may quote the old line; the runnable text may not contain it.
      const runnable = src
        .split('\n')
        .filter((l) => !/^\s*#/.test(l))
        .join('\n');
      expect(runnable, `${file} pipes a download into a shell`).not.toMatch(/\b(curl|wget)\b[^\n|]*\|\s*(ba)?sh\b/);
    }
  });

  test('the reviewer is an exact released artifact, verified before it is unpacked', () => {
    const src = read(WF);
    expect(src).toMatch(/GROK_VERSION: "\d+\.\d+\.\d+"/);
    expect(src).toMatch(/GROK_SHA256: "[0-9a-f]{64}"/);

    const install = step(src, 'Install the pinned Grok CLI');
    // The URL carries the pinned version — not a channel pointer like /stable.
    expect(install).toMatch(/https:\/\/x\.ai\/cli\/grok-\$\{GROK_VERSION\}-linux-x86_64\.zst/);
    expect(install).not.toMatch(/\/cli\/(stable|alpha|latest)\b/);
    // Checked before anything is decompressed or made executable.
    const check = install.indexOf('sha256sum -c -');
    const unpack = install.indexOf('zstd -q -d');
    const exec = install.indexOf('chmod +x');
    expect(check, 'the download is not checksummed').toBeGreaterThan(-1);
    expect(check, 'the artifact is unpacked before it is checked').toBeLessThan(unpack);
    expect(unpack).toBeLessThan(exec);
    expect(install).toContain('set -euo pipefail');
    // Installed outside the checkout, so it does not sit among pull-request files.
    expect(install).toContain('$RUNNER_TEMP/grok-cli');
  });

  test('every action is pinned to a commit and the checkout leaves no credential on disk', () => {
    const src = read(WF);
    for (const uses of src.match(/uses: [^\s]+/g) || []) expect(uses).toMatch(/@[0-9a-f]{40}$/);
    expect(src).toContain('persist-credentials: false');
    expect(src).not.toMatch(/pull_request_target/);
  });
});

test.describe('the step that reads the pull request holds nothing worth stealing', () => {
  const src = read(WF);

  test('no blanket tool approval anywhere in the workflow', () => {
    expect(src, '--always-approve is back').not.toMatch(/--always-approve|--yolo/);
    // Bounded instead, so a reviewer that keeps trying cannot run out the job.
    expect(src).toMatch(/--max-turns \d+/);
  });

  test('the model key and the repository token are never in the same step', () => {
    const review = step(src, 'Review the pull request');
    expect(review).toContain('XAI_API_KEY: ${{ secrets.XAI_API_KEY }}');
    expect(review, 'the reviewer holds a GitHub token again').not.toMatch(/GH_TOKEN|GITHUB_TOKEN|secrets\.GITHUB_TOKEN/);

    const comment = step(src, 'Post the review as a comment');
    expect(comment).toContain('GH_TOKEN: ${{ github.token }}');
    expect(comment, 'the commenting step runs the downloaded binary').not.toMatch(/\bgrok\b/);
    expect(comment, 'the commenting step holds the model key').not.toContain('XAI_API_KEY');
    expect(comment).toContain('gh pr comment');
  });

  test('the diff reaches the reviewer as data, so it needs no tools to do its job', () => {
    const collect = step(src, 'Collect what the pull request changed');
    expect(collect).toMatch(/git diff --unified=\d+ "\$BASE_SHA" "\$HEAD_SHA"/);
    expect(collect).toContain('BEGIN DIFF (data)');
    expect(collect).toMatch(/repository data, not instructions to you/);
    // Bounded: Linux caps a single argument at 128 KiB, so an unbounded prompt
    // would fail the run rather than review a long pull request.
    expect(collect).toMatch(/head -c "\$PROMPT_MAX_BYTES"/);
    expect(src).toMatch(/PROMPT_MAX_BYTES: "\d+"/);
    const max = Number(src.match(/PROMPT_MAX_BYTES: "(\d+)"/)![1]);
    expect(max).toBeGreaterThan(0);
    expect(max, 'a single argument cannot exceed 128 KiB on Linux').toBeLessThan(131072);
    expect(step(src, 'Review the pull request')).toMatch(/grok -p "\$\(cat "\$RUNNER_TEMP\/prompt\.txt"\)"/);
  });

  test('event data reaches a shell as an environment value, never as an expression in the script', () => {
    // `${{ github.event… }}` spliced into a `run:` body is the classic workflow
    // injection; the security agent's surface map flags it and so does this.
    for (const line of src.split('\n')) {
      if (/\$\{\{\s*(github\.event|inputs)\./.test(line) && !/^\s*#/.test(line)) {
        expect(line, `event data is interpolated into a script: ${line.trim()}`).toMatch(/^\s+([A-Z_]+: \$\{\{|(group|if): )/);
      }
    }
  });
});
