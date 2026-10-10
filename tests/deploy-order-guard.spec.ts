/**
 * codex code-ci-03 — an older pipeline run never deploys over a newer commit.
 *
 * Every push to dev or main runs .github/workflows/deploy.yml on its own. A run
 * whose validate job is slower can reach its deploy after a newer commit has
 * shipped, and would put older app and runner code back. The pipeline therefore
 * asks the remote for the branch head as the last step before each deploy and
 * deploys only if that is still its own commit.
 *
 * Why not a `concurrency:` group for the run or the deploy: GitHub keeps one
 * pending run per group and cancels it when a later one queues — by queue time,
 * not by commit — so an older run that reaches the group late would cancel the
 * newer run's waiting deploy. This spec pins that decision too, so nobody adds
 * the group back as the "fix".
 *
 * The one exception (roadmap "before 3.0.7 — Tests never spend the production
 * model budget", point 4): `build` and `e2e` carry a group per branch with
 * `cancel-in-progress`, so a newer push ends the older run's tests and their
 * model calls. Cancelling a test job can only stop a deploy, never start one,
 * and no deploy job is in any group.
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
  const next = rest.slice(1).search(/^ {2}[a-z][a-z0-9-]*:$/m);
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

test('both jobs run the same check, and only the test jobs have a concurrency group', () => {
  const src = wf();
  expect(checkScript(job(src, 'deploy-runner'), 'runners')).toBe(checkScript(job(src, 'deploy'), 'app'));
  // A group on the run or on a deploy would cancel a newer run's pending deploy
  // when an older run queues later — so none at workflow level…
  expect(src).not.toMatch(/^concurrency:/m);
  // …and exactly two at job level, on the two test jobs and nowhere else.
  const groups = [...src.matchAll(/^( *)concurrency:/gm)];
  expect(groups.map((m) => m[1].length)).toEqual([4, 4]);
  for (const name of ['validate', 'security', 'deploy-runner', 'deploy', 'smoke-production']) {
    expect(job(src, name), `${name} must never be in a concurrency group`).not.toMatch(/^ {4}concurrency:/m);
  }
  // Per branch; per shard as well for the matrix, or the shards of one run would cancel each other.
  expect(job(src, 'build')).toMatch(/\n {4}concurrency:\n {6}group: build-\$\{\{ github\.ref \}\}\n {6}cancel-in-progress: true\n/);
  expect(job(src, 'e2e')).toMatch(
    /\n {4}concurrency:\n {6}group: e2e-\$\{\{ github\.ref \}\}-\$\{\{ matrix\.shard \}\}\n {6}cancel-in-progress: true\n/,
  );
  // A cancelled test job stops the deploy: the gate needs both, and the deploy needs the gate.
  expect(job(src, 'validate')).toMatch(/\n {4}needs: \[build, e2e\]\n/);
  expect(job(src, 'deploy')).toContain("needs.validate.result == 'success'");
});

/**
 * codex architecture-04 / code-ci-03: the pipeline no longer ends at the deploy.
 * After a deploy from main that actually ran, a job checks the revision it put
 * live (scripts/qa/smoke.mjs --target production; the checks themselves are held
 * in tests/qa-review-guard.spec.ts). It turns the run red on a failure and names
 * the rollback; it never performs one, and it holds no Google credential that
 * could.
 */
test('every deploy from main is followed by a smoke check of the production revision, which can read and nothing else', () => {
  const src = wf();
  // The deploy job says whether it deployed, from the same check that gates the deploy step.
  expect(job(src, 'deploy')).toMatch(/\n {4}outputs:\n {6}deployed: \$\{\{ steps\.fresh\.outputs\.current \}\}\n/);

  const smoke = job(src, 'smoke-production');
  expect(smoke).toMatch(/\n {4}needs: \[deploy\]\n/);
  // `!cancelled()`: with the runner job switched off (skipped) a plain condition would skip this job as well.
  expect(smoke).toContain(
    "if: ${{ !cancelled() && github.ref_name == 'main' && needs.deploy.result == 'success' && needs.deploy.outputs.deployed == 'true' }}",
  );
  expect(smoke).toContain('run: node scripts/qa/smoke.mjs --target production');
  expect(smoke).toContain('QA_HEAD: ${{ github.sha }}');

  // Read-only: no OIDC token, no Google sign-in, no deploy, no traffic change, no install.
  expect(smoke).toMatch(/\n {4}permissions:\n {6}contents: read\n {4}steps:/);
  expect(smoke).not.toMatch(/id-token|write/);
  expect(smoke).not.toMatch(/google-github-actions\/|gcloud|update-traffic|npm (ci|install)/);
  expect(smoke).toContain('persist-credentials: false');
  // Exactly one secret, the sealing key, and only as an env entry.
  expect([...smoke.matchAll(/secrets\.([A-Z_]+)/g)].map((m) => m[1])).toEqual(['QA_REVIEW_KEY']);
  for (const line of smoke.split('\n').filter((l) => /\$\{\{\s*secrets\./.test(l))) expect(line).toMatch(/^\s+[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/);

  // The sealed result is uploaded on a failure too - that is when it is read.
  const upload = steps(smoke).find((s) => s.name === 'Upload sealed smoke result');
  expect(upload, 'no sealed upload').toBeTruthy();
  expect(upload!.text).toContain('if: ${{ !cancelled() }}');
  expect(upload!.text).toContain('path: .qa-review/out/prod-smoke.enc.json');
  expect(upload!.text).toContain('name: prod-smoke-${{ github.sha }}-${{ github.run_attempt }}');

  // It is the last job, and nothing in the workflow depends on it: a red smoke reports, it does not block or undo.
  expect(src.trimEnd().endsWith(smoke.trimEnd())).toBe(true);
  expect(src).not.toMatch(/needs: \[[^\]]*smoke-production/);

  // Every action in the whole pipeline is pinned to a commit.
  const uses = src.match(/uses: [^\s]+/g) || [];
  expect(uses.length).toBeGreaterThan(0);
  for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/);
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
