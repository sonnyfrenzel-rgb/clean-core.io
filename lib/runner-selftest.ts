/**
 * The authorized negative test of the isolated test runner — roadmap 8.9.
 *
 * *„Ein autorisierter Negativtest auf dem Deploymentprofil erreicht weder fremde
 * Dateien noch Zugangsdaten."* The runners take requests only from the app
 * (`ingress=internal`, `run.invoker` for the app's service account), so the test
 * travels the way generated code travels: the app sends a suite to the runner,
 * the runner executes it in its sandbox, the report comes back. The suite is
 * fixed here, in the source — the admin route that sends it takes no code from
 * its caller, so it cannot be used to run anything else.
 *
 * Every probe passes only when the attempt FAILS: a readable file, a secret-named
 * variable or an open connection is a failed test. Each probe is a single,
 * ordinary operation (read a path, list the environment, open a connection) and
 * nothing more — the question is whether the boundary holds, not how to cross it.
 * A probe that cannot even be attempted because the sandbox refuses the module
 * counts as held, and says so: the in-process guards are part of the boundary.
 *
 * What it does not claim: that the runner's service account has no roles. That
 * is an IAM fact, checked with `gcloud` against the project, and the operator
 * runbook (SECURITY.md §7) lists it next to this test.
 */

/** Names of the probes, in the order the suite runs them. */
export const SELFTEST_PROBES = [
  'no secret-named environment variables',
  'no file outside the sandbox directory is readable',
  'no connection to a public internet host',
  'no connection to the metadata address',
  'no connection to a private address',
] as const;

export type SelftestProbe = (typeof SELFTEST_PROBES)[number];

const PROBE_TIMEOUT_MS = 4000;

/**
 * The suite, as `node:test` source. Paths and hosts are fixed. Kept as a
 * template so the probe names above and the test names inside cannot drift.
 */
export const RUNNER_SELFTEST_SUITE = `import { test } from 'node:test';
import assert from 'node:assert/strict';

const TIMEOUT = ${PROBE_TIMEOUT_MS};

async function refused(label, attempt) {
  try {
    await attempt();
  } catch (err) {
    return String((err && err.message) || err).slice(0, 160);
  }
  assert.fail(label + ' succeeded');
}

async function connectRefused(host, port) {
  return refused('connection to ' + host + ':' + port, async () => {
    const net = await import('node:net');
    await new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('timed out')); }, TIMEOUT);
      socket.once('connect', () => { clearTimeout(timer); socket.destroy(); resolve(); });
      socket.once('error', (e) => { clearTimeout(timer); reject(e); });
    });
  });
}

test(${JSON.stringify(SELFTEST_PROBES[0])}, () => {
  const named = Object.keys(process.env).filter((k) => /KEY|SECRET|TOKEN|PASSWORD|PEPPER|CREDENTIAL|PRIVATE/i.test(k));
  assert.deepEqual(named, []);
});

test(${JSON.stringify(SELFTEST_PROBES[1])}, async () => {
  for (const p of ['/etc/hostname', '/proc/self/environ', '/proc/1/environ', '/proc/1/cmdline']) {
    await refused('reading ' + p, async () => {
      const fs = await import('node:fs');
      fs.readFileSync(p);
    });
  }
});

test(${JSON.stringify(SELFTEST_PROBES[2])}, async () => {
  await refused('fetch to a public host', () => fetch('https://www.google.com/', { signal: AbortSignal.timeout(TIMEOUT) }));
  await connectRefused('8.8.8.8', 53);
});

test(${JSON.stringify(SELFTEST_PROBES[3])}, async () => {
  await connectRefused('169.254.169.254', 80);
});

test(${JSON.stringify(SELFTEST_PROBES[4])}, async () => {
  await connectRefused('10.10.0.1', 443);
});
`;

export const RUNNER_SELFTEST_FILE = 'runner-selftest.test.mjs';

export interface SelftestProbeResult {
  probe: SelftestProbe;
  held: boolean;
}

export interface SelftestVerdict {
  /** True only if the suite ran and every probe held. */
  held: boolean;
  probes: SelftestProbeResult[];
  /** Why the verdict is not a pass, in words; null when it is. */
  reason: string | null;
}

/**
 * Reads the TAP the runner reported. A probe holds only on an explicit `ok`
 * line with its exact name; a missing line is a failure, never a pass — a
 * suite that did not run proves nothing.
 */
export function evaluateSelftest(report: { outcome: string; stdout: string; exitCode: number }): SelftestVerdict {
  const probes = SELFTEST_PROBES.map((probe) => {
    const okLine = new RegExp(`^\\s*ok \\d+ - ${escapeRegExp(probe)}\\s*$`, 'm');
    return { probe, held: okLine.test(report.stdout) };
  });
  if (report.outcome !== 'ran') {
    return { held: false, probes, reason: 'The suite did not run (build error) — nothing was proven.' };
  }
  const broken = probes.filter((p) => !p.held).map((p) => p.probe);
  if (broken.length > 0) {
    return { held: false, probes, reason: `Not held: ${broken.join('; ')}.` };
  }
  if (report.exitCode !== 0) {
    return { held: false, probes, reason: `Every probe reported ok, but the suite exited with ${report.exitCode}.` };
  }
  return { held: true, probes, reason: null };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
