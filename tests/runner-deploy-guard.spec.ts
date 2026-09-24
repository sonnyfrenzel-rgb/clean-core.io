/**
 * Roadmap 8.9 — the isolated runners are deployed the way the decision of
 * 24.09.2026 describes them, and the image carries nothing of the app.
 *
 * Source-level on purpose: a deploy cannot be run from a spec, and every flag
 * below is one a later edit could drop without any test noticing.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const wf = () => read('.github/workflows/deploy.yml');

function job(src: string, name: string): string {
  const start = src.indexOf(`\n  ${name}:\n`);
  expect(start, `no job ${name}`).toBeGreaterThan(-1);
  const rest = src.slice(start + 1);
  const next = rest.slice(1).search(/^ {2}[a-z][a-z-]*:$/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

function step(src: string, name: string): string {
  const start = src.indexOf(`- name: ${name}`);
  expect(start, `no step ${name}`).toBeGreaterThan(-1);
  const rest = src.slice(start);
  const next = rest.indexOf('\n      - name: ', 1);
  return next === -1 ? rest : rest.slice(0, next);
}

const COMMON_FLAGS = [
  '--no-allow-unauthenticated',
  '--ingress=internal',
  '--service-account=clean-core-runner@cleancore-491216.iam.gserviceaccount.com',
  '--network=runner-net',
  '--vpc-egress=all-traffic',
  '--concurrency=1',
];

test.describe('the runner job', () => {
  test('passes the same gate as the app, signs in the same way, and reads no secret', () => {
    const j = job(wf(), 'deploy-runner');
    expect(j).toMatch(/needs:\s*\[validate,\s*security\]/);
    expect(j).toContain("if: vars.RUNNER_DEPLOY_ENABLED == 'true'");
    expect(j).toContain('id-token: write');
    expect(j).toContain('google-github-actions/auth@c200f3691d83b41bf9bbd8638997a462592937ed');
    expect(j).toContain("workload_identity_provider: 'projects/819734065839/locations/global/workloadIdentityPools/github-pool/providers/github-provider'");
    expect(j, 'the runner job reads a repository secret').not.toMatch(/secrets\./);
    expect(j, 'the runner job installs dependencies next to an OIDC token').not.toMatch(/npm (ci|install)/);
  });

  test('both services carry every isolation flag, each with its own subnet and tag', () => {
    const j = job(wf(), 'deploy-runner');
    for (const [name, subnet, tag, mode] of [
      ['Deploy Mock Runner', 'runner-mock', 'runner-mock', 'mock'],
      ['Deploy Live Runner', 'runner-live', 'runner-live', 'live'],
    ]) {
      const s = step(j, name);
      for (const flag of COMMON_FLAGS) expect(s, `${name}: ${flag}`).toContain(flag);
      expect(s).toContain(`--subnet=${subnet}`);
      expect(s).toContain(`--network-tags=${tag}`);
      expect(s).toMatch(/--max-instances=[1-5]\n/);
      expect(s).toContain(`RUNNER_MODE=${mode}`);
      expect(s).toContain('env_vars_update_strategy: overwrite');
      expect(s, `${name} is deployed publicly`).not.toContain('--allow-unauthenticated\n');
      expect(s, `${name} deploys from source instead of the checked image`).not.toContain('source:');
      expect(s).toContain('image: ${{ steps.image.outputs.digest }}');
    }
  });

  test('the app deploy waits for the runners, goes ahead when they are switched off, never when they failed', () => {
    const d = job(wf(), 'deploy');
    expect(d).toMatch(/needs:\s*\[validate,\s*security,\s*deploy-runner\]/);
    expect(d).toContain("needs.deploy-runner.result == 'success' || needs.deploy-runner.result == 'skipped'");
    expect(d).toContain("needs.validate.result == 'success'");
    expect(d).toContain("needs.security.result == 'success'");
  });

  test('the app gets the runner addresses from variables, checked for shape; empty stays empty', () => {
    const d = job(wf(), 'deploy');
    for (const line of [
      'RUNNER_URL=${{ steps.env-ctx.outputs.runner_url }}',
      'RUNNER_LIVE_URL=${{ steps.env-ctx.outputs.runner_live_url }}',
      'RUNNER_SERVICE_ACCOUNT=${{ steps.env-ctx.outputs.runner_sa }}',
      'S4_PROXY_BASE_URL=${{ steps.env-ctx.outputs.proxy_base }}',
    ]) {
      expect(d).toContain(line);
    }
    const ctx = step(d, 'Set Environment Context');
    for (const v of ['RUNNER_URL_MAIN', 'RUNNER_URL_DEV', 'RUNNER_LIVE_URL_MAIN', 'RUNNER_LIVE_URL_DEV', 'S4_PROXY_BASE_URL_MAIN', 'S4_PROXY_BASE_URL_DEV', 'RUNNER_SERVICE_ACCOUNT']) {
      expect(ctx).toContain(`\${{ vars.${v} }}`);
    }
    expect(ctx).toContain("grep -Eq '^https://[a-z0-9.-]+$'");
    // The old switch is not deployed anywhere.
    expect(wf()).not.toContain('S4_TEST_RUNNER_EGRESS_ENFORCED');
  });
});

test.describe('the runner image', () => {
  test('node:22-slim, not root, built from the runner and the shared core only', () => {
    const df = read('runner/Dockerfile');
    expect(df.match(/^FROM node:22-slim/gm)?.length).toBe(2);
    expect(df).toContain('USER node');
    const copies = [...df.matchAll(/^COPY (?!--from)(.+)$/gm)].map((m) => m[1]);
    const sources = copies.flatMap((c) => c.trim().split(/\s+/).slice(0, -1));
    const allowed = /^(runner\/(package\.json|package-lock\.json|server\.ts|relay\.ts)|lib\/test-sandbox\/|lib\/(sandbox-module-guard|test-verdicts|google-id-token)\.ts)$/;
    for (const s of sources) expect(s, `the image copies ${s}`).toMatch(allowed);
    const instructions = df.split(/\r?\n/).filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(instructions).not.toMatch(/\.env|secret|firebase|ARG |--build-arg/i);
  });

  test('the build context is an allowlist that matches what the Dockerfile copies', () => {
    const ignore = read('runner/Dockerfile.dockerignore').split(/\r?\n/).filter((l) => l && !l.startsWith('#'));
    expect(ignore[0]).toBe('*');
    for (const line of ignore.slice(1)) expect(line.startsWith('!'), line).toBe(true);
    expect(ignore.join('\n')).not.toMatch(/\.env|app\/|components\//);
  });

  test('the shared core and what it imports stay free of app code', () => {
    // What the image bundles, followed import by import.
    const seen = new Set<string>();
    const visit = (rel: string) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const src = read(rel);
      for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
        const next = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])) + '.ts';
        visit(next);
      }
      expect(src, `${rel} imports through the app alias`).not.toMatch(/from '@\//);
      expect(src, `${rel} imports firebase or next`).not.toMatch(/from '(firebase|firebase-admin|next)[/']/);
    };
    visit('runner/server.ts');
    expect([...seen].sort()).toEqual([
      'lib/google-id-token.ts',
      'lib/sandbox-module-guard.ts',
      'lib/test-sandbox/core.ts',
      'lib/test-sandbox/files.ts',
      'lib/test-sandbox/net-guard.ts',
      'lib/test-sandbox/protocol.ts',
      'lib/test-verdicts.ts',
      'runner/relay.ts',
      'runner/server.ts',
    ]);
  });

  test('esbuild in the runner is the version the app pins', () => {
    const runnerPkg = JSON.parse(read('runner/package.json'));
    const lock = JSON.parse(read('package-lock.json'));
    expect(runnerPkg.dependencies).toEqual({ esbuild: lock.packages['node_modules/esbuild'].version });
    expect(Object.keys(JSON.parse(read('runner/package-lock.json')).packages[''].dependencies)).toEqual(['esbuild']);
  });
});
