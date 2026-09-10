import net from 'node:net';

/**
 * Is the test runner's network egress actually restricted by infrastructure?
 *
 * Why this exists: `S4_TEST_RUNNER_EGRESS_ENFORCED=true` used to be the entire
 * answer, and that one variable did two things at once. It unlocked live
 * S/4HANA test execution — putting decrypted tenant credentials into the child
 * process — and it removed `__netguard.mjs`, the only defence that actually
 * stops a generated test from reaching the GCP metadata endpoint. Nothing
 * checked whether the claim behind the variable was true. Setting it in the
 * belief that it merely "turns on live mode" therefore also deleted the guard,
 * and the two effects are invisible to each other at the call site.
 *
 * A variable is an assertion. This is a measurement: the same container the
 * runner child runs in tries to open a TCP connection to the cloud metadata
 * endpoint and to a public address. If either answers, egress is not restricted,
 * whatever the variable says.
 *
 * What this is NOT: proof of a deny-by-default policy. Two endpoints are a
 * sample, not a formal boundary, and a policy that blocks these two while
 * allowing a third would still pass. It is evidence, and it reliably catches
 * the dangerous default — an unrestricted container — which is the state the
 * variable was silently trusted not to be in.
 *
 * Fails closed: anything other than a clean "unreachable" counts as reachable.
 */

/** Cloud metadata service — the runtime service-account token lives behind this. */
const METADATA_HOST = '169.254.169.254';
const METADATA_PORT = 80;
const METADATA_TIMEOUT_MS = 1_000;

/**
 * A stable public address, probed to detect general egress. An IP literal on
 * purpose: a hostname would test DNS as much as egress, and a container with
 * no resolver but open egress would look blocked.
 */
const PUBLIC_HOST = '1.1.1.1';
const PUBLIC_PORT = 443;
const PUBLIC_TIMEOUT_MS = 1_500;

export interface EgressAttestation {
  /** True only when every probe came back cleanly unreachable. */
  restricted: boolean;
  /** Per-probe outcome, for the operator who has to act on a refusal. */
  probes: Array<{ target: string; reachable: boolean; detail: string }>;
}

/**
 * Error codes that mean the packet did not get anywhere — a dropped or rejected
 * route. `ECONNREFUSED` is deliberately absent: a refusal is an RST from
 * something that received the packet, so the path exists and only the port is
 * shut. Counting that as "restricted" would pass a container whose egress is
 * wide open to every other port.
 */
const UNREACHABLE_CODES = new Set([
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EHOSTDOWN',
  'ENETDOWN',
  'EACCES',
  'EPERM',
]);

function probe(host: string, port: number, timeoutMs: number): Promise<{ reachable: boolean; detail: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (reachable: boolean, detail: string) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch {
        /* already gone */
      }
      resolve({ reachable, detail });
    };

    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true, 'connected'));
    socket.once('timeout', () => done(false, 'timeout'));
    socket.once('error', (err: NodeJS.ErrnoException) => {
      const code = err?.code || 'UNKNOWN';
      // Unknown failures are treated as reachable so an unexpected error can
      // never be the thing that unlocks live credentials.
      done(!UNREACHABLE_CODES.has(code), code);
    });

    try {
      socket.connect(port, host);
    } catch (err) {
      done(true, (err as NodeJS.ErrnoException)?.code || 'throw');
    }
  });
}

let cached: Promise<EgressAttestation> | null = null;

async function measure(): Promise<EgressAttestation> {
  const [metadata, publicNet] = await Promise.all([
    probe(METADATA_HOST, METADATA_PORT, METADATA_TIMEOUT_MS),
    probe(PUBLIC_HOST, PUBLIC_PORT, PUBLIC_TIMEOUT_MS),
  ]);

  const probes = [
    { target: `${METADATA_HOST}:${METADATA_PORT} (cloud metadata)`, ...metadata },
    { target: `${PUBLIC_HOST}:${PUBLIC_PORT} (public internet)`, ...publicNet },
  ];

  return { restricted: probes.every((p) => !p.reachable), probes };
}

/**
 * Measured once per process. Egress policy is a property of the deployment, not
 * of the request, and probing on every run would add seconds of latency to a
 * 15-second budget. A policy change lands with the next revision, which is a
 * new process.
 */
export function attestEgressRestricted(): Promise<EgressAttestation> {
  if (!cached) cached = measure();
  return cached;
}

/** Test seam: forget the measurement so a spec can drive it twice. */
export function resetEgressAttestation(): void {
  cached = null;
}

/**
 * The whole gate in one place: live tenant execution needs the operator's
 * intent AND a container that demonstrably cannot reach the metadata endpoint.
 * Either half alone is not enough, which is the point — the variable used to be
 * the whole gate.
 */
export async function liveRunnerPermitted(): Promise<{ permitted: boolean; reason: string; attestation: EgressAttestation | null }> {
  if (process.env.S4_TEST_RUNNER_EGRESS_ENFORCED !== 'true') {
    return {
      permitted: false,
      reason: 'Live S/4HANA test execution is disabled until runner network egress is restricted by infrastructure policy.',
      attestation: null,
    };
  }

  const attestation = await attestEgressRestricted();
  if (!attestation.restricted) {
    const reachable = attestation.probes.filter((p) => p.reachable).map((p) => `${p.target}: ${p.detail}`);
    return {
      permitted: false,
      reason:
        'Live S/4HANA test execution is disabled: S4_TEST_RUNNER_EGRESS_ENFORCED is set, but this runtime can still reach ' +
        reachable.join('; ') +
        '. The variable asserts an egress policy that is not in force.',
      attestation,
    };
  }

  return { permitted: true, reason: 'Egress restriction attested by probe.', attestation };
}
