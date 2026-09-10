/**
 * E08-F01-US02 — an insufficiently isolated runner can be switched off, and
 * cannot be switched back on by an environment variable alone.
 *
 * The acceptance criterion this pins, from the roadmap:
 *
 *   "Bei deaktiviertem oder nicht attestiertem Runner lehnt die API neue
 *    Ausführungen serverseitig ab. Ein Frontend-Flag oder das bloße Setzen
 *    einer Egress-Umgebungsvariable aktiviert ihn nicht."
 *
 * Before this, `S4_TEST_RUNNER_EGRESS_ENFORCED=true` was the whole gate, and it
 * did two things at once: unlocked live tenant credentials into the child
 * process, and deleted `__netguard.mjs` — the only thing stopping generated
 * test code from reading the cloud metadata endpoint. Nothing verified that the
 * egress policy the variable asserted was actually in force.
 */
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { attestEgressRestricted, resetEgressAttestation, liveRunnerPermitted } from '../lib/runner-egress-attestation';

const ROOT = path.resolve(__dirname, '..');
const ROUTE = path.resolve(ROOT, 'app/api/run-tests/route.ts');
const ATTESTATION = path.resolve(ROOT, 'lib/runner-egress-attestation.ts');

function routeSource(): string {
  return fs.readFileSync(ROUTE, 'utf8');
}

test.describe('the runner cannot be enabled by a variable alone', () => {
  test('the live gate consults the attestation, not just the env var', () => {
    const src = routeSource();

    expect(
      src.includes('liveRunnerPermitted'),
      'the live path must go through liveRunnerPermitted(), which measures egress rather than trusting the flag',
    ).toBe(true);

    // The route must not make its own decision straight off the variable —
    // that was the bug. Reading it is fine inside the attestation module.
    const decidesOnEnvDirectly = /if\s*\(\s*process\.env\.S4_TEST_RUNNER_EGRESS_ENFORCED\s*!==\s*'true'\s*\)/.test(src);
    expect(
      decidesOnEnvDirectly,
      'run-tests/route.ts must not gate live execution on the env var directly; that check belongs behind the attestation',
    ).toBe(false);
  });

  test('the attestation probes the metadata endpoint and the public internet', () => {
    const src = fs.readFileSync(ATTESTATION, 'utf8');
    expect(src).toContain('169.254.169.254');
    expect(
      /PUBLIC_HOST\s*=\s*'[\d.]+'/.test(src),
      'the public probe must use an IP literal — a hostname tests DNS as much as egress',
    ).toBe(true);
  });

  test('a refused connection does not count as restricted', () => {
    const src = fs.readFileSync(ATTESTATION, 'utf8');
    // ECONNREFUSED means an RST came back, so the packet reached something and
    // only that port was shut. Treating it as "blocked" would pass a container
    // whose egress is open on every other port.
    expect(src).not.toMatch(/UNREACHABLE_CODES[\s\S]{0,300}'ECONNREFUSED'/);
  });

  test('an unknown probe error fails closed', () => {
    const src = fs.readFileSync(ATTESTATION, 'utf8');
    expect(
      src.includes('!UNREACHABLE_CODES.has(code)'),
      'anything not on the unreachable list must count as reachable, so a surprise error cannot unlock live credentials',
    ).toBe(true);
  });
});

test.describe('the network guard is never removed', () => {
  test('no code path skips writing __netguard.mjs', () => {
    const src = routeSource();

    // The old shape: `const applyNetGuard = ... !== 'true'` followed by
    // `if (applyNetGuard)`. If either returns, the guard is optional again.
    expect(src).not.toContain('applyNetGuard');

    const guardWrite = src.indexOf('__netguard.mjs');
    expect(guardWrite, '__netguard.mjs must still be written').toBeGreaterThan(-1);
  });

  test('the guard always blocks the metadata endpoint, on both paths', () => {
    const src = routeSource();

    // On the closed path everything is blocked outright. On the allowlisted
    // live path, connections are gated by host suffix — and 169.254.169.254 is
    // an IP literal that matches no suffix, so it cannot be reached either way.
    expect(src).toContain('ALLOWED_SUFFIXES');
    expect(src).toContain('function allowed(host)');
    expect(
      src.includes('h.endsWith(s)'),
      'the allowlist must match host suffixes, so a bare IP address never qualifies',
    ).toBe(true);
  });

  test('the allowlist is empty unless the live run was actually attested', () => {
    const src = routeSource();
    expect(
      /const allowedSuffixes\s*=\s*live\.permitted/.test(src),
      'the allowlist must hang off live.permitted, not off the env var or the request body',
    ).toBe(true);
  });

  test('a sandbox run blocks DNS and fetch outright', () => {
    const src = routeSource();
    // Both are conditional on there being no allowlist — i.e. every non-live run.
    expect(src).toContain('if (ALLOWED_SUFFIXES.length === 0) {');
    expect(src).toContain('globalThis.fetch = BLOCK');
  });
});

/**
 * The checks above read source, which a future refactor could satisfy while
 * changing the behaviour. These run the gate.
 *
 * Both a dev machine and a CI runner have open egress, so the measurement here
 * is the dangerous case the variable used to be trusted to rule out — which
 * makes this the exact scenario worth pinning.
 */
test.describe('the gate, executed', () => {
  test('an unrestricted runtime is measured as unrestricted', async () => {
    resetEgressAttestation();

    const attestation = await attestEgressRestricted();
    test.skip(attestation.restricted, 'this runtime already blocks egress; the open-egress case cannot be exercised here');

    expect(attestation.restricted).toBe(false);
    expect(attestation.probes.some((p) => p.reachable)).toBe(true);
  });

  test('setting the env var on an unrestricted runtime does not permit live execution', async () => {
    resetEgressAttestation();

    const attestation = await attestEgressRestricted();
    test.skip(attestation.restricted, 'this runtime already blocks egress; the open-egress case cannot be exercised here');

    const before = process.env.S4_TEST_RUNNER_EGRESS_ENFORCED;
    process.env.S4_TEST_RUNNER_EGRESS_ENFORCED = 'true';
    try {
      const decision = await liveRunnerPermitted();
      // This is the acceptance criterion, executed: the variable is set, and
      // live execution is still refused, because the claim behind it is false.
      expect(decision.permitted).toBe(false);
      expect(decision.reason).toContain('can still reach');
    } finally {
      if (before === undefined) delete process.env.S4_TEST_RUNNER_EGRESS_ENFORCED;
      else process.env.S4_TEST_RUNNER_EGRESS_ENFORCED = before;
      resetEgressAttestation();
    }
  });

  test('without the env var it is refused regardless of the measurement', async () => {
    resetEgressAttestation();

    const before = process.env.S4_TEST_RUNNER_EGRESS_ENFORCED;
    delete process.env.S4_TEST_RUNNER_EGRESS_ENFORCED;
    try {
      const decision = await liveRunnerPermitted();
      expect(decision.permitted).toBe(false);
      expect(decision.attestation, 'no probe should run when intent is absent').toBeNull();
    } finally {
      if (before !== undefined) process.env.S4_TEST_RUNNER_EGRESS_ENFORCED = before;
      resetEgressAttestation();
    }
  });
});

test.describe('the honest limits are written down, not implied', () => {
  test('the attestation says it is evidence and not proof', () => {
    const src = fs.readFileSync(ATTESTATION, 'utf8');
    expect(
      /not\s+proof|NOT: proof/i.test(src),
      'a two-endpoint probe is a sample; the module must say so rather than read as a guarantee',
    ).toBe(true);
  });

  test('the weaker half of the narrowed guard is named in the code', () => {
    const src = routeSource();
    expect(
      /DNS tunnelling is possible again/i.test(src),
      'allowing DNS on the live path is a real reduction in the guard and must be stated where it happens',
    ).toBe(true);
  });
});
