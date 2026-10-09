import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * The deploy cannot pass on a tree that does not type-check (roadmap
 * E16-F01-US02: "typecheck, tests and required approvals are mandatory checks").
 *
 * `next build` type-checks the application and stops there. Nothing ran tsc over
 * the tests, and two type errors in tests/run-integrity-guard.spec.ts sat unseen
 * from 27 August until 11 September. The pipeline now runs `npm run typecheck`
 * — the whole tsconfig, tests included — as a step of the job the deploy needs.
 */
const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');

test('package.json has a typecheck over the whole project', () => {
  const pkg = JSON.parse(read('package.json'));
  expect(pkg.scripts.typecheck).toBe('tsc --noEmit -p .');
});

/**
 * Since 09.10.2026 the gate is three jobs in deploy.yml: `build` (lint, build,
 * type check, build output uploaded), `e2e` (the suite as parallel shards
 * against that output) and `validate` (the gate the deploy jobs need).
 */
const workflow = () => read('.github/workflows/deploy.yml').replace(/\r\n/g, '\n');

function job(src: string, name: string): string {
  const start = src.indexOf(`\n  ${name}:\n`);
  expect(start, `no job ${name} in deploy.yml`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/^ {2}[a-z][a-z0-9-]*:$/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** The job's steps, each from its `- name:` line to the next one. */
function steps(jobSrc: string): { name: string; text: string }[] {
  return jobSrc
    .split(/\n(?= {6}- name: )/)
    .slice(1)
    .map((text) => ({ name: /- name: (.*)/.exec(text)![1].trim(), text }));
}

test('the build job lints, builds and type-checks, in that order, and hands its output to the tests', () => {
  const wf = workflow();
  const build = job(wf, 'build');
  const lint = build.indexOf('run: npm run lint');
  const next = build.indexOf('run: npm run build');
  const typecheck = build.indexOf('run: npm run typecheck');
  // A missing step is -1, which is "before" everything (QA full review of
  // fc787674705f, 4a2e26a0fa4a) — so each must be present first.
  expect(lint, 'no lint step in the build job').toBeGreaterThan(-1);
  expect(next, 'no build step in the build job').toBeGreaterThan(-1);
  expect(typecheck, 'no typecheck step in the build job').toBeGreaterThan(-1);
  expect(lint).toBeLessThan(next);
  expect(next).toBeLessThan(typecheck);
  // The build is the emulator build the suite needs.
  const buildStep = steps(build).find((s) => s.text.includes('run: npm run build'))!;
  expect(buildStep.text).toContain("NEXT_PUBLIC_USE_FIREBASE_EMULATOR: 'true'");

  // The output is uploaded after the type check, and every shard tests that very output.
  const upload = steps(build).find((s) => s.text.includes('actions/upload-artifact@'));
  expect(upload, 'the build output is not uploaded').toBeTruthy();
  expect(build.indexOf(upload!.text)).toBeGreaterThan(typecheck);
  const name = /\n\s+name: (\S+)/.exec(upload!.text)?.[1];
  expect(name, 'the build artifact has no name').toBeTruthy();
  expect(upload!.text).toContain('if-no-files-found: error');
  const pack = steps(build).find((s) => /tar -c\S* \S+ /.test(s.text));
  expect(pack, 'the build output is not packed').toBeTruthy();
  expect(pack!.text).toMatch(/--exclude=\.next\/cache \.next\n/);

  const e2e = job(wf, 'e2e');
  expect(e2e).toMatch(/\n {4}needs: build\n/);
  const download = steps(e2e).find((s) => s.text.includes('actions/download-artifact@'));
  expect(download, 'the shards do not download the build').toBeTruthy();
  expect(download!.text).toContain(`name: ${name}`);
  // The shards never build for themselves: they test the output the type check passed over.
  expect(e2e).not.toMatch(/npm run build|next build/);
  const unpack = e2e.indexOf('tar -xf ');
  expect(unpack, 'the shards do not unpack the build').toBeGreaterThan(-1);
  expect(e2e).toContain('test -f .next/BUILD_ID');
  expect(unpack).toBeLessThan(e2e.indexOf('npx playwright test --shard='));
});

test('the deploy waits for the gate, and the gate for the build and every shard', () => {
  const wf = workflow();
  const validate = job(wf, 'validate');
  expect(validate).toMatch(/\n {4}needs: \[build, e2e\]\n/);
  // It runs when a needed job failed, to fail itself — and fails unless both succeeded.
  expect(validate).toContain('if: ${{ !cancelled() }}');
  expect(validate).toContain('BUILD_RESULT: ${{ needs.build.result }}');
  expect(validate).toContain('E2E_RESULT: ${{ needs.e2e.result }}');
  expect(validate).toMatch(/if \[ "\$BUILD_RESULT" != "success" \] \|\| \[ "\$E2E_RESULT" != "success" \]; then\n\s+echo "::error::[^"]*"\n\s+exit 1\n\s+fi/);
  // Nothing in the gate's jobs may swallow a failure.
  for (const name of ['build', 'e2e', 'validate']) {
    expect(job(wf, name), `${name} carries continue-on-error`).not.toMatch(/continue-on-error/);
  }
  expect(job(wf, 'e2e'), 'a step of the e2e job is conditional').not.toMatch(/\n\s+if:/);
  // Both deploy jobs wait for validate, and the app deploy only on its success.
  expect(job(wf, 'deploy-runner')).toMatch(/\n {4}needs: \[validate, security\]\n/);
  expect(job(wf, 'deploy')).toMatch(/\n {4}needs: \[validate, security, deploy-runner\]\n/);
  expect(job(wf, 'deploy')).toContain("needs.validate.result == 'success'");
});

test('the tsconfig still covers the tests', () => {
  const tsconfig = read('tsconfig.json');
  expect(tsconfig).toContain('"**/*.ts"');
  expect(tsconfig).not.toMatch(/"exclude":\s*\[[^\]]*"tests"/);
});

test('the deploy gate and Security CI block on the same severity', () => {
  expect(read('.github/workflows/deploy.yml')).toContain('npm audit --omit=dev --audit-level=high');
  const auditCi = read('audit-ci.jsonc');
  expect(auditCi).toMatch(/"high":\s*true/);
});

test('the E2E job runs every shard of the suite, each on fresh emulators, and fails when any shard fails', () => {
  // 04.10.2026: one emulator for the whole suite collapsed after an hour (abandoned
  // Firestore channels). Sharding must not drop a test or hide a red shard.
  // 09.10.2026: the shards run as a matrix, one runner and one emulator each.
  const e2e = job(workflow(), 'e2e');
  const matrix = e2e.match(/\n {4}strategy:\n {6}fail-fast: false\n {6}matrix:\n {8}shard: \[([\d, ]+)\]\n/);
  expect(matrix, 'no shard matrix with fail-fast: false').not.toBeNull();
  const list = matrix![1].split(',').map((s) => Number(s.trim()));
  expect(list.length, 'fewer than two shards is no sharding').toBeGreaterThan(1);
  expect(list).toEqual(Array.from({ length: list.length }, (_, i) => i + 1));
  // The matrix has one entry dimension only: no include/exclude that adds or drops a shard.
  expect(e2e).not.toMatch(/\n\s+(include|exclude):/);

  const run = steps(e2e).filter((s) => s.text.includes('npx playwright test'));
  expect(run.length, 'the suite runs more or less than once per shard').toBe(1);
  expect(run[0].text).toContain(`run: npx playwright test --shard=\${{ matrix.shard }}/${list.length}\n`);
  expect(run[0].text, 'a skipped or filtered shard').not.toMatch(/--grep|--last-failed|--only-changed|--project|test\.skip|\|\||; *true/);
  expect(e2e, 'a filtered or skipped run').not.toMatch(/--grep|--last-failed|--only-changed|test\.skip/);

  // Each shard starts its own emulators, for the right project, and waits until both answer.
  const start = steps(e2e).find((s) => s.text.includes('emulators:start'));
  expect(start, 'the shard starts no emulator').toBeTruthy();
  expect(start!.text).toContain('emulators:start --only auth,firestore --project=cleancore-491216');
  const wait = steps(e2e).find((s) => s.name === 'Wait for Firebase Emulator');
  expect(wait, 'the shard does not wait for the emulators').toBeTruthy();
  expect(wait!.text).toContain('curl -sf http://127.0.0.1:8080/');
  expect(wait!.text).toContain('curl -sf http://127.0.0.1:9099/');
  expect(wait!.text, 'emulators that never come up must stop the shard').toMatch(/exit 1\s*$/);
  const order = [start!, wait!, run[0]].map((s) => e2e.indexOf(s.text));
  expect(order).toEqual([...order].sort((a, b) => a - b));
  expect(start!.text, 'a blind sleep instead of the wait').not.toMatch(/sleep/);

  // The test history the archive spec checks is there (tests/terms-version-archive.spec.ts).
  const checkout = steps(e2e).find((s) => s.text.includes('actions/checkout@'))!;
  expect(checkout.text).toMatch(/\n\s+fetch-depth: 0\n/);
});

test('the shards hold the test model key only on the server side, and the deploy jobs no OIDC token for them', () => {
  const wf = workflow();
  const run = steps(job(wf, 'e2e')).find((s) => s.text.includes('npx playwright test'))!;
  expect(run.text).toContain('GEMINI_API_KEY: ${{ secrets.TEST_GEMINI_API_KEY }}');
  for (const name of ['build', 'e2e', 'validate']) {
    const j = job(wf, name);
    expect(j, `${name} exposes a model key to the client bundle`).not.toMatch(/NEXT_PUBLIC_[A-Z_]*KEY/);
    expect(j, `${name} may mint an OIDC token`).not.toMatch(/id-token/);
    expect(j, `${name} widens the permissions`).not.toMatch(/\n {4}permissions:/);
  }
  // The workflow default the three inherit stays read-only.
  expect(wf).toMatch(/\npermissions:\n {2}contents: read\n\n/);
});
