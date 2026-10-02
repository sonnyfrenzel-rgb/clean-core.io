/**
 * codex code-ci-03 — an older pipeline run never deploys over a newer commit.
 *
 * Every push to dev or main runs .github/workflows/deploy.yml on its own. A run
 * whose validate job is slower can reach its deploy after a newer commit has
 * shipped, and would put older app and runner code back. The pipeline therefore
 * asks the remote for the branch head as the last step before each deploy and
 * deploys only if that is still its own commit.
 *
 * Why not a `concurrency:` group: GitHub keeps one pending run per group and
 * cancels it when a later one queues — by queue time, not by commit — so an older
 * run that reaches the group late would cancel the newer run's waiting deploy.
 * This spec pins that decision too, so nobody adds the group back as the "fix".
 *
 * Half source, half behaviour: the check's own shell is run against a real git
 * remote for a current, a superseded and an unreadable head.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync, spawnSync } from 'child_process';

const ROOT = path.resolve(__dirname, '..');
const wf = () => fs.readFileSync(path.resolve(ROOT, '.github/workflows/deploy.yml'), 'utf8').replace(/\r\n/g, '\n');

function job(src: string, name: string): string {
  const start = src.indexOf(`\n  ${name}:\n`);
  expect(start, `no job ${name}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/^ {2}[a-z][a-z-]*:$/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The job's steps, each from its `- name:` line to the next one. */
function steps(jobSrc: string): { name: string; text: string }[] {
  const parts = jobSrc.split(/\n(?= {6}- name: )/).slice(1);
  return parts.map((text) => ({ name: /- name: (.*)/.exec(text)![1].trim(), text }));
}

function checkScript(jobSrc: string, label: string): string {
  const s = steps(jobSrc).find((x) => x.name === `Newest Commit Wins (${label})`);
  expect(s, `no newest-commit check in the ${label} job`).toBeTruthy();
  expect(s!.text).toContain('id: fresh');
  expect(s!.text).toContain('REF_NAME: ${{ github.ref_name }}');
  expect(s!.text).toContain('SHA: ${{ github.sha }}');
  const body = s!.text.slice(s!.text.indexOf('run: |\n') + 'run: |\n'.length);
  // The block ends at the first line indented less than its own (the next step's comments).
  const lines = body.split('\n');
  const end = lines.findIndex((l) => l.trim() !== '' && !l.startsWith(' '.repeat(10)));
  return (end === -1 ? lines : lines.slice(0, end))
    .map((l) => l.replace(/^ {10}/, ''))
    .join('\n')
    .trim();
}

const GATE = "if: steps.fresh.outputs.current == 'true'";

test('every Cloud Run deploy is gated by the newest-commit check, which runs right before it', () => {
  const src = wf();
  for (const [name, label] of [['deploy-runner', 'runners'], ['deploy', 'app']] as const) {
    const all = steps(job(src, name));
    const check = all.findIndex((s) => s.name === `Newest Commit Wins (${label})`);
    expect(check, `${name}: no newest-commit check`).toBeGreaterThan(-1);
    const deploys = all.map((s, i) => [s, i] as const).filter(([s]) => s.text.includes('google-github-actions/deploy-cloudrun@'));
    expect(deploys.length, `${name}: no deploy step`).toBeGreaterThan(0);
    for (const [s, i] of deploys) {
      expect(s.text, `${s.name} deploys without the newest-commit check`).toContain(GATE);
      expect(i, `${s.name} runs before the newest-commit check`).toBeGreaterThan(check);
    }
    // "Right before": nothing but the gated deploys follows the check, so no slow
    // step (the image build, the sign-in) widens the window between check and deploy.
    expect(all.slice(check + 1).every((s) => s.text.includes(GATE)), `${name}: a step sits between the check and the deploy`).toBe(true);
  }
  // Every deploy-cloudrun step of the workflow is one of the gated ones.
  const uses = src.match(/google-github-actions\/deploy-cloudrun@/g)?.length;
  const gated = steps(job(src, 'deploy-runner')).concat(steps(job(src, 'deploy'))).filter((s) => s.text.includes('deploy-cloudrun@') && s.text.includes(GATE)).length;
  expect(gated).toBe(uses);
});

test('both jobs run the same check, and the workflow has no concurrency group', () => {
  const src = wf();
  expect(checkScript(job(src, 'deploy-runner'), 'runners')).toBe(checkScript(job(src, 'deploy'), 'app'));
  // A group would cancel a newer run's pending deploy when an older run queues later.
  expect(src).not.toMatch(/^\s*concurrency:/m);
});

/** Git's own bash on Windows (System32\bash.exe is WSL); `bash` elsewhere. */
function bash(): string {
  if (process.platform !== 'win32') return 'bash';
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const candidate = path.resolve(exec, '..', '..', '..', 'bin', 'bash.exe');
  expect(fs.existsSync(candidate), `no Git bash at ${candidate}`).toBe(true);
  return candidate;
}

test('the check deploys the head, skips a superseded commit, and stops when the head cannot be read', () => {
  const script = checkScript(job(wf(), 'deploy'), 'app');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-newest-'));
  const git = (cwd: string, ...args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  try {
    const origin = path.join(dir, 'origin.git');
    const work = path.join(dir, 'work');
    git(dir, 'init', '--bare', '-q', origin);
    git(dir, 'init', '-q', '-b', 'dev', work);
    const commit = (msg: string) => {
      git(work, '-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', msg);
      return git(work, 'rev-parse', 'HEAD');
    };
    const older = commit('A');
    const newer = commit('B');
    git(work, 'remote', 'add', 'origin', origin);
    git(work, 'push', '-q', 'origin', 'dev');

    const run = (env: Record<string, string>) => {
      const out = path.join(dir, `out-${Math.random().toString(36).slice(2)}`);
      fs.writeFileSync(out, '');
      const r = spawnSync(bash(), ['-c', script], { cwd: work, encoding: 'utf8', env: { ...process.env, ...env, GITHUB_OUTPUT: out } });
      return { status: r.status, output: fs.readFileSync(out, 'utf8').trim(), log: `${r.stdout}${r.stderr}` };
    };

    expect(run({ REF_NAME: 'dev', SHA: newer })).toMatchObject({ status: 0, output: 'current=true' });
    const stale = run({ REF_NAME: 'dev', SHA: older });
    expect(stale).toMatchObject({ status: 0, output: 'current=false' });
    expect(stale.log).toContain('::notice::');
    // A branch the remote does not have: fail closed, decide nothing.
    expect(run({ REF_NAME: 'gone', SHA: newer })).toMatchObject({ status: 1, output: '' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
